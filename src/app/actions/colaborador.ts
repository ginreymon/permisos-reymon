"use server";

import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";

import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearSesion, leerSesion, borrarSesion } from "@/lib/colaborador/session";
import { normalizar, soloDigitos, primerApellido, enmascararNombre, enmascararCedula, esCargoDirectivo, esCargoPorteria } from "@/lib/colaborador/identidad";
import { fmtDuracion, fmtFechaHora, fmtRadicado } from "@/lib/colaborador/formato";
import { NOMBRE_TIPO, type PermisoVista, type ResultadoIdentidad, type ResultadoCrear, type ResultadoSimple, type TipoCatalogo } from "@/lib/colaborador/tipos";
import { cupoDelMes, soporteVencido, instanteBogota, type SolicitudCupo } from "@/lib/reglas";
import type { CodigoTipo } from "@/lib/supabase/database.types";

const VERSION_HABEAS = "v1-2026-09";
const MS_24H = 24 * 3600 * 1000; // anticipación mínima del permiso
const TIEMPO_CONSTANTE_MS = 700;
const MAX_INTENTOS = 5;
const VENTANA_MIN = 15;
const ERROR_GENERICO = "No pudimos validar tus datos. Verifícalos o comunícate con Talento Humano.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ipCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0].trim()) || h.get("x-real-ip") || "desconocida";
}

const hashDoc = (doc: string) => crypto.createHash("sha256").update(doc).digest("hex");

// ── Mapeo fila -> vista, con reglas de soporte ──────────────────────────────
interface FilaSolicitud {
  id: number; tipo: CodigoTipo; fecha: string; hora_salida: string; minutos: number;
  min_cubierto: number; min_personal: number; estado: PermisoVista["estado"];
  soporte_path: string | null; regreso_real: string | null; creado_en: string;
  motivo_rechazo: string | null; comentario_coordinador: string | null;
}

function aVista(f: FilaSolicitud, exigeSoporte: boolean, ahora: Date): PermisoVista {
  const tieneSoporte = !!f.soporte_path;
  const regresoReal = f.regreso_real ? new Date(f.regreso_real) : null;
  const vencido =
    exigeSoporte && !tieneSoporte &&
    soporteVencido(ahora, regresoReal, f.fecha, f.hora_salida, f.minutos);
  const relevante = ["pendiente", "aprobado", "en_curso", "cerrado"].includes(f.estado);
  return {
    id: f.id,
    tipo: f.tipo,
    tipoNombre: NOMBRE_TIPO[f.tipo],
    minutos: f.minutos,
    minCubierto: f.min_cubierto,
    minPersonal: f.min_personal,
    duracion: fmtDuracion(f.minutos),
    fecha: f.fecha,
    fechaHora: fmtFechaHora(f.fecha, f.hora_salida),
    radicado: fmtRadicado(f.creado_en),
    estado: f.estado,
    exigeSoporte,
    tieneSoporte,
    faltaSoporte: exigeSoporte && !tieneSoporte && relevante,
    plazoVencido: vencido,
    motivoRechazo: f.motivo_rechazo,
    comentario: f.comentario_coordinador,
  };
}

const COLS = "id,tipo,fecha,hora_salida,minutos,min_cubierto,min_personal,estado,soporte_path,regreso_real,creado_en,motivo_rechazo,comentario_coordinador";

async function cargarPermisos(doc: string): Promise<PermisoVista[]> {
  const admin = crearClienteAdmin();
  const hace60 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: tipos }, { data: filas }] = await Promise.all([
    admin.from("tipos_permiso").select("codigo,exige_soporte"),
    admin.from("solicitudes").select(COLS).eq("documento", doc).gte("fecha", hace60)
      .in("estado", ["pendiente", "aprobado", "en_curso", "cerrado"]) // historial: solo pendientes y aprobados; sin rechazados ni cancelados
      .order("creado_en", { ascending: false }),
  ]);
  const exige = new Map((tipos ?? []).map((t) => [t.codigo, t.exige_soporte]));
  const ahora = new Date();
  return (filas ?? []).map((f) => aVista(f as FilaSolicitud, exige.get((f as FilaSolicitud).tipo) ?? false, ahora));
}

// ── Identificación ──────────────────────────────────────────────────────────
export async function validarIdentidad(formData: FormData): Promise<ResultadoIdentidad> {
  const t0 = Date.now();
  const finApagado = async (r: ResultadoIdentidad): Promise<ResultadoIdentidad> => {
    const resto = TIEMPO_CONSTANTE_MS - (Date.now() - t0);
    if (resto > 0) await sleep(resto);
    return r;
  };

  const cedula = soloDigitos(String(formData.get("cedula") ?? ""));
  const apellido = String(formData.get("apellido") ?? "");
  const habeas = formData.get("habeas") === "on" || formData.get("habeas") === "true";

  if (!cedula || !apellido.trim()) return finApagado({ ok: false, error: "Completa la cédula y el primer apellido." });
  if (!habeas) return finApagado({ ok: false, error: "Debes autorizar el tratamiento de tus datos." });

  const admin = crearClienteAdmin();
  const ip = await ipCliente();
  const docHash = hashDoc(cedula);
  const desde = new Date(Date.now() - VENTANA_MIN * 60 * 1000).toISOString();

  // Rate limit: 5 fallidos por cédula o IP en 15 min.
  const { count } = await admin
    .from("intentos_ingreso")
    .select("id", { count: "exact", head: true })
    .eq("exitoso", false)
    .gte("en", desde)
    .or(`documento_hash.eq.${docHash},ip.eq.${ip}`);
  if ((count ?? 0) >= MAX_INTENTOS) {
    return finApagado({ ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." });
  }

  const { data: emp } = await admin.rpc("empleado_por_documento", { p_doc: cedula });
  const fila = Array.isArray(emp) ? emp[0] : null;
  const ok = !!fila && primerApellido(fila.nombre) === normalizar(apellido);

  await admin.from("intentos_ingreso").insert({ documento_hash: docHash, ip, exitoso: ok });

  if (!ok || !fila) return finApagado({ ok: false, error: ERROR_GENERICO });

  await admin.from("consentimientos").insert({ documento: cedula, version_texto: VERSION_HABEAS, ip });
  await crearSesion({ doc: cedula, nom: fila.nombre, cc: fila.centro_costo, cargo: fila.cargo ?? "" });

  const permisos = await cargarPermisos(cedula);
  return finApagado({
    ok: true,
    identidad: { cedula: enmascararCedula(cedula), nombreMask: enmascararNombre(fila.nombre), area: fila.centro_costo },
    permisos,
  });
}

// ── Nuevo permiso ─────────────────────────────────────────────────────────────
const esquemaCrear = z.object({
  tipo: z.enum(["PP", "PM", "PA", "PE"]),
  horas: z.coerce.number().int().min(0).max(8),
  minutos: z.coerce.number().int().min(0).max(59),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "hora inválida"),
  observaciones: z.string().max(500).optional(),
});

export async function crearPermiso(formData: FormData): Promise<ResultadoCrear> {
  const sesion = await leerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión expiró. Vuelve a identificarte." };

  const parsed = esquemaCrear.safeParse({
    tipo: formData.get("tipo"),
    horas: formData.get("horas"),
    minutos: formData.get("minutos"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    observaciones: formData.get("observaciones") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Revisa los datos del permiso." };
  const d = parsed.data;
  const minutos = d.horas * 60 + d.minutos;
  if (minutos <= 0) return { ok: false, error: "La duración no puede ser cero." };

  // Mínimo 24 h de anticipación respecto a la hora de salida (no se permite el mismo día).
  if (instanteBogota(d.fecha, d.hora).getTime() - Date.now() < MS_24H) {
    return { ok: false, error: "El permiso debe solicitarse al menos 24 horas antes de la hora de salida." };
  }

  const admin = crearClienteAdmin();

  const { data: tipoRow } = await admin
    .from("tipos_permiso").select("tope_min_mes").eq("codigo", d.tipo).single();
  const tope = tipoRow?.tope_min_mes ?? null;

  const { data: previasRaw } = await admin
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", sesion.doc);
  const previas = (previasRaw ?? []) as SolicitudCupo[];

  const reparto = cupoDelMes(minutos, tope, previas, d.tipo, d.fecha, "preview");

  const { data: creada, error } = await admin
    .from("solicitudes")
    .insert({
      documento: sesion.doc, nombre: sesion.nom, centro_costo: sesion.cc,
      tipo: d.tipo, fecha: d.fecha, hora_salida: d.hora, minutos,
      observaciones: d.observaciones ?? null,
      min_cubierto: reparto.cubierto, min_personal: reparto.personal,
      estado: "pendiente", creado_por: null,
      // Cargos coordinador/jefe y portería: lo aprueba la Dirección General, no un
      // coordinador par.
      para_director: esCargoDirectivo(sesion.cargo) || esCargoPorteria(sesion.cargo),
    })
    .select("id").single();
  if (error || !creada) return { ok: false, error: "No se pudo enviar la solicitud. Intenta de nuevo." };

  // Soporte opcional (se puede enviar sin él).
  const file = formData.get("soporte");
  if (file instanceof File && file.size > 0) {
    const path = `${sesion.doc}/${creada.id}/${crypto.randomUUID()}.jpg`;
    const up = await admin.storage.from("permisos-soportes").upload(path, file, {
      contentType: file.type || "image/jpeg", upsert: false,
    });
    if (!up.error) {
      await admin.from("solicitudes").update({ soporte_path: path, soporte_subido_en: new Date().toISOString() }).eq("id", creada.id);
    }
  }

  return { ok: true, id: creada.id };
}

// ── Subir soporte tardío ──────────────────────────────────────────────────────
export async function subirSoporte(formData: FormData): Promise<ResultadoSimple> {
  const sesion = await leerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión expiró. Vuelve a identificarte." };
  const id = Number(formData.get("id"));
  const file = formData.get("soporte");
  if (!Number.isInteger(id) || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Adjunta una foto válida." };
  }
  const admin = crearClienteAdmin();
  const { data: sol } = await admin
    .from("solicitudes").select("fecha,hora_salida,minutos,regreso_real,soporte_path")
    .eq("id", id).eq("documento", sesion.doc).single();
  if (!sol) return { ok: false, error: "No encontramos la solicitud." };
  if (sol.soporte_path) return { ok: false, error: "Ya tiene soporte." };
  const regresoReal = sol.regreso_real ? new Date(sol.regreso_real) : null;
  if (soporteVencido(new Date(), regresoReal, sol.fecha, sol.hora_salida, sol.minutos)) {
    return { ok: false, error: "El plazo de 24 horas para subir el soporte ya venció." };
  }
  const path = `${sesion.doc}/${id}/${crypto.randomUUID()}.jpg`;
  const up = await admin.storage.from("permisos-soportes").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: false,
  });
  if (up.error) return { ok: false, error: "No se pudo subir la foto. Intenta de nuevo." };
  await admin.from("solicitudes").update({ soporte_path: path, soporte_subido_en: new Date().toISOString() }).eq("id", id);
  return { ok: true, permisos: await cargarPermisos(sesion.doc) };
}

// ── Refrescar / Salir ─────────────────────────────────────────────────────────
export async function refrescarPermisos(): Promise<ResultadoSimple> {
  const sesion = await leerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión expiró. Vuelve a identificarte." };
  return { ok: true, permisos: await cargarPermisos(sesion.doc) };
}

export async function salir(): Promise<void> {
  await borrarSesion();
}

// ── Catálogo de tipos (para el formulario) ────────────────────────────────────
export async function tiposCatalogo(): Promise<TipoCatalogo[]> {
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("tipos_permiso").select("codigo,tope_min_mes,exige_soporte").eq("activo", true).order("codigo");
  return (data ?? []).map((t) => ({
    codigo: t.codigo,
    nombre: NOMBRE_TIPO[t.codigo],
    topeMinMes: t.tope_min_mes,
    exigeSoporte: t.exige_soporte,
  }));
}
