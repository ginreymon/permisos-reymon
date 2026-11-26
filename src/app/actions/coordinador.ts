"use server";

import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { fmtDuracion } from "@/lib/colaborador/formato";
import { sumarMinutosHora } from "@/lib/colaborador/hora";
import { soloDigitos, esCargoDirectivo } from "@/lib/colaborador/identidad";
import { cupoDelMes, instanteBogota, type SolicitudCupo } from "@/lib/reglas";
import {
  NOMBRE_TIPO, TIPO_CORTO, fmtFechaRelativa, fmtHace, historialTexto,
  type CoordVista, type ResultadoDecision,
} from "@/lib/coordinador/vista";
import type { CodigoTipo, EstadoSolicitud, Database } from "@/lib/supabase/database.types";

type SolicitudInsert = Database["permisos"]["Tables"]["solicitudes"]["Insert"];

const MS_24H = 24 * 3600 * 1000; // ventana de 24 h (urgente)

/** Empleado encontrado por cédula para el formulario de creación del coordinador. */
export interface EmpleadoCoord {
  documento: string;
  nombre: string; // sin enmascarar (el coordinador sí puede verlo)
  area: string; // centro_costo (nombre)
  cargo: string;
  esDirectivo: boolean;
}
export type ResultadoEmpleado =
  | { ok: true; empleado: EmpleadoCoord; previas: SolicitudCupo[] }
  | { ok: false; error: string };
export type ResultadoCrearCoord = { ok: true; id: number; pendiente: boolean } | { ok: false; error: string };

const MOTIVOS = [
  "No reconozco esta solicitud",
  "No hay cubrimiento ese día",
  "Falta el documento soporte",
  "Otro motivo",
];

const COLS =
  "id,documento,nombre,tipo,fecha,hora_salida,minutos,estado,observaciones,soporte_path,salida_real,regreso_real,motivo_rechazo,comentario_coordinador,creado_en";

interface Fila {
  id: number; documento: string; nombre: string; tipo: CodigoTipo; fecha: string; hora_salida: string;
  minutos: number; estado: EstadoSolicitud; observaciones: string | null; soporte_path: string | null;
  salida_real: string | null; regreso_real: string | null; motivo_rechazo: string | null;
  comentario_coordinador: string | null; creado_en: string;
}

function hhmmBogota(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  });
}

function seSolapan(aIni: number, aFin: number, bIni: number, bFin: number): boolean {
  return aIni < bFin && bIni < aFin;
}
const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export interface EstadoCoordinador {
  areas: string[];
  correo: string;
  esDirector: boolean;
  pendientes: CoordVista[];
  resueltos: CoordVista[];
}

/** Estado de la bandeja para la página. null = no autenticado / no es coordinador. */
export async function estadoCoordinador(): Promise<EstadoCoordinador | null> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "coordinador") return null;
  // La Dirección General entra con rol coordinador; su bandeja son los permisos de
  // cargos directivos de todas las áreas (lo resuelve la RLS sol_director_*).
  const { data: director } = await supa.rpc("soy_director");
  const esDirector = director === true;
  const { data: centros } = await supa.rpc("mis_centros");
  const areas = (centros ?? []) as string[];

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const hace60 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [{ data: tipos }, { data: filasRaw }] = await Promise.all([
    supa.from("tipos_permiso").select("codigo,exige_soporte"),
    supa.from("solicitudes").select(COLS).or(`estado.eq.pendiente,fecha.gte.${hace60}`).order("creado_en", { ascending: false }),
  ]);
  const exige = new Map((tipos ?? []).map((t) => [t.codigo, t.exige_soporte]));
  const filas = (filasRaw ?? []) as Fila[];

  // Índice por documento para historial y solapamiento.
  const porDoc = new Map<string, Fila[]>();
  for (const f of filas) {
    const arr = porDoc.get(f.documento) ?? [];
    arr.push(f);
    porDoc.set(f.documento, arr);
  }

  const aVista = (f: Fila): CoordVista => {
    const exigeSoporte = exige.get(f.tipo) ?? false;
    const tieneSoporte = !!f.soporte_path;
    const salida = f.hora_salida.slice(0, 5);
    const regreso = sumarMinutosHora(salida, f.minutos);

    const otros = porDoc.get(f.documento) ?? [];
    const historial = historialTexto(
      otros
        .filter((o) => o.id !== f.id && ["aprobado", "en_curso", "cerrado"].includes(o.estado))
        .map((o) => ({ tipo: o.tipo, minutos: o.minutos })),
    );

    let solapado: string | null = null;
    const ini = min(salida), fin = min(regreso);
    const choque = otros.find((o) =>
      o.id !== f.id && o.estado === "aprobado" && o.fecha === f.fecha &&
      seSolapan(ini, fin, min(o.hora_salida.slice(0, 5)), min(sumarMinutosHora(o.hora_salida.slice(0, 5), o.minutos))),
    );
    if (choque) {
      const pn = f.nombre.split(/\s+/)[0];
      solapado = `${pn} ya tiene un permiso aprobado para ${fmtFechaRelativa(f.fecha, hoy, manana).toLowerCase()}, de ${choque.hora_salida.slice(0, 5)} a ${sumarMinutosHora(choque.hora_salida.slice(0, 5), choque.minutos)}.`;
    }

    return {
      id: f.id, documento: f.documento, nombre: f.nombre,
      tipo: f.tipo, tipoNombre: NOMBRE_TIPO[f.tipo], tipoCorto: TIPO_CORTO[f.tipo],
      fecha: f.fecha, fechaTexto: fmtFechaRelativa(f.fecha, hoy, manana),
      salida, regreso, duracion: fmtDuracion(f.minutos), minutos: f.minutos,
      radicado: fmtHace(f.creado_en), estado: f.estado, observaciones: f.observaciones,
      exigeSoporte, tieneSoporte, faltaSoporte: exigeSoporte && !tieneSoporte,
      historial, solapado,
      salidaReal: hhmmBogota(f.salida_real), regresoReal: hhmmBogota(f.regreso_real),
      motivoRechazo: f.motivo_rechazo, comentario: f.comentario_coordinador,
    };
  };

  const vistas = filas.map(aVista);
  return {
    areas,
    correo: user.email ?? "",
    esDirector,
    pendientes: vistas.filter((v) => v.estado === "pendiente"),
    resueltos: vistas.filter((v) => v.estado !== "pendiente"),
  };
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function cerrarSesion(): Promise<void> {
  const supa = await crearClienteServidor();
  await supa.auth.signOut();
}

// ── Aprobar ─────────────────────────────────────────────────────────────────
export async function aprobar(id: number, comentario: string): Promise<ResultadoDecision> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const { data: sol } = await supa
    .from("solicitudes").select("documento,tipo,fecha,minutos").eq("id", id).eq("estado", "pendiente").single();
  if (!sol) return { ok: false, error: "Esta solicitud ya fue decidida." };

  const { data: tp } = await supa.from("tipos_permiso").select("tope_min_mes").eq("codigo", sol.tipo).single();
  const { data: previasRaw } = await supa
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", sol.documento);
  const reparto = cupoDelMes(sol.minutos, tp?.tope_min_mes ?? null, (previasRaw ?? []) as SolicitudCupo[], sol.tipo, sol.fecha, "definitivo", id);

  const { data: upd, error } = await supa
    .from("solicitudes")
    .update({
      estado: "aprobado", decidido_por: user.id, decidido_en: new Date().toISOString(),
      comentario_coordinador: comentario.trim() || null,
      min_cubierto: reparto.cubierto, min_personal: reparto.personal,
    })
    .eq("id", id).eq("estado", "pendiente").select("id");
  if (error || !upd?.length) return { ok: false, error: "No se pudo aprobar. Quizá ya fue decidida." };
  return { ok: true };
}

// ── Rechazar ──────────────────────────────────────────────────────────────────
export async function rechazar(id: number, motivo: string, comentario: string): Promise<ResultadoDecision> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };
  if (!MOTIVOS.includes(motivo)) return { ok: false, error: "Elige un motivo para rechazar." };
  // El motivo ya se explica solo; solo "Otro motivo" necesita comentario.
  if (motivo === "Otro motivo" && !comentario.trim()) {
    return { ok: false, error: "Cuéntale al colaborador por qué lo rechazas." };
  }

  const { data: upd, error } = await supa
    .from("solicitudes")
    .update({
      estado: "rechazado", decidido_por: user.id, decidido_en: new Date().toISOString(),
      motivo_rechazo: motivo, comentario_coordinador: comentario.trim() || null,
      // Entró solo con cédula+apellido: RRHH revisa quién hizo la solicitud.
      alerta_rrhh: motivo === "No reconozco esta solicitud",
    })
    .eq("id", id).eq("estado", "pendiente").select("id");
  if (error || !upd?.length) return { ok: false, error: "No se pudo rechazar. Quizá ya fue decidida." };
  return { ok: true };
}

// ── Ver soporte (URL firmada corta) ──────────────────────────────────────────
export async function verSoporte(id: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supa = await crearClienteServidor();
  const { data: sol } = await supa.from("solicitudes").select("soporte_path").eq("id", id).single();
  if (!sol?.soporte_path) return { ok: false, error: "No hay documento soporte." };

  const admin = crearClienteAdmin();
  const { data, error } = await admin.storage.from("permisos-soportes").createSignedUrl(sol.soporte_path, 300);
  if (error || !data) return { ok: false, error: "No se pudo abrir el soporte." };
  return { ok: true, url: data.signedUrl };
}

// ── Crear permiso por cédula (coordinador) ─────────────────────────────────────
// El coordinador genera permisos urgentes (salida dentro de las próximas 24 h, lo
// que el colaborador no puede autogestionar). Se crean ya aprobados, para su área.

/** Valida sesión de coordinador y devuelve sus centros (áreas). */
async function sesionCoordinador() {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false as const, error: "Tu sesión expiró." };
  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "coordinador") return { ok: false as const, error: "Solo un coordinador puede hacer esto." };
  const { data: centros } = await supa.rpc("mis_centros");
  const { data: director } = await supa.rpc("soy_director");
  return { ok: true as const, user, supa, areas: (centros ?? []) as string[], esDirector: director === true };
}

/** Busca un empleado por cédula para prellenar el formulario. Solo de su área. */
export async function buscarEmpleadoCoord(cedulaRaw: string): Promise<ResultadoEmpleado> {
  const s = await sesionCoordinador();
  if (!s.ok) return { ok: false, error: s.error };
  const cedula = soloDigitos(cedulaRaw);
  if (!cedula) return { ok: false, error: "Escribe la cédula del colaborador." };

  const admin = crearClienteAdmin();
  const { data: emp } = await admin.rpc("empleado_por_documento", { p_doc: cedula });
  const fila = Array.isArray(emp) ? emp[0] : null;
  if (!fila) return { ok: false, error: "No encontramos un empleado activo con esa cédula." };
  if (!s.esDirector && !s.areas.includes(fila.centro_costo)) {
    return { ok: false, error: "Ese colaborador no pertenece a tu área." };
  }

  // Permisos previos del empleado (para la vista previa de cupo, igual que el colaborador).
  const { data: previasRaw } = await admin
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", cedula);

  return {
    ok: true,
    empleado: {
      documento: fila.documento, nombre: fila.nombre, area: fila.centro_costo,
      cargo: fila.cargo ?? "", esDirectivo: esCargoDirectivo(fila.cargo),
    },
    previas: (previasRaw ?? []) as SolicitudCupo[],
  };
}

const esquemaCrearCoord = z.object({
  cedula: z.string(),
  tipo: z.enum(["PP", "PM", "PA", "PE"]),
  horas: z.coerce.number().int().min(0).max(8),
  minutos: z.coerce.number().int().min(0).max(59),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "hora inválida"),
  observaciones: z.string().max(500).optional(),
});

export async function crearComoCoordinador(formData: FormData): Promise<ResultadoCrearCoord> {
  const s = await sesionCoordinador();
  if (!s.ok) return { ok: false, error: s.error };

  const parsed = esquemaCrearCoord.safeParse({
    cedula: formData.get("cedula"),
    tipo: formData.get("tipo"),
    horas: formData.get("horas"),
    minutos: formData.get("minutos"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    observaciones: formData.get("observaciones") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Revisa los datos del permiso." };
  const d = parsed.data;
  const cedula = soloDigitos(d.cedula);
  const minutos = d.horas * 60 + d.minutos;
  if (minutos <= 0) return { ok: false, error: "La duración no puede ser cero." };

  const faltaMs = instanteBogota(d.fecha, d.hora).getTime() - Date.now();
  if (faltaMs <= 0) return { ok: false, error: "La hora de salida ya pasó." };
  const urgente = faltaMs <= MS_24H; // dentro de las próximas 24 h

  const admin = crearClienteAdmin();
  const { data: emp } = await admin.rpc("empleado_por_documento", { p_doc: cedula });
  const fila = Array.isArray(emp) ? emp[0] : null;
  if (!fila) return { ok: false, error: "No encontramos un empleado activo con esa cédula." };
  // El coordinador solo crea dentro de su área; la Dirección General, en cualquiera.
  if (!s.esDirector && !s.areas.includes(fila.centro_costo)) {
    return { ok: false, error: "Ese colaborador no pertenece a tu área." };
  }

  const directivo = esCargoDirectivo(fila.cargo);
  const paraDirector = directivo;

  // Matriz creador × destino × tiempo:
  //  - Colaborador: solo urgente (<24 h); nace aprobado. Los futuros los pide él mismo.
  //  - Directivo (incl. el propio coordinador):
  //      · creado por coordinador: solo futuro (>24 h) -> pendiente para la Dirección General.
  //        El urgente de un directivo lo genera la Dirección General, no un coordinador.
  //      · creado por la Dirección General: urgente o futuro -> nace aprobado por ella.
  let estado: EstadoSolicitud;
  let decidioId: string | null = null;
  if (directivo) {
    if (s.esDirector) {
      estado = "aprobado"; decidioId = s.user.id;
    } else {
      if (urgente) return { ok: false, error: "Un permiso urgente de un cargo directivo lo genera la Dirección General." };
      estado = "pendiente";
    }
  } else {
    if (!urgente) return { ok: false, error: "Con más de 24 horas de anticipación, el permiso lo solicita el propio colaborador." };
    estado = "aprobado"; decidioId = s.user.id;
  }

  const { data: tp } = await admin.from("tipos_permiso").select("tope_min_mes").eq("codigo", d.tipo).single();
  const { data: previasRaw } = await admin
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", cedula);
  const reparto = cupoDelMes(
    minutos, tp?.tope_min_mes ?? null, (previasRaw ?? []) as SolicitudCupo[],
    d.tipo, d.fecha, estado === "aprobado" ? "definitivo" : "preview",
  );

  const row: SolicitudInsert = {
    documento: cedula, nombre: fila.nombre, centro_costo: fila.centro_costo,
    tipo: d.tipo, fecha: d.fecha, hora_salida: d.hora, minutos,
    observaciones: d.observaciones ?? null,
    min_cubierto: reparto.cubierto, min_personal: reparto.personal,
    creado_por: s.user.id, para_director: paraDirector,
    estado, decidido_por: decidioId,
    decidido_en: decidioId ? new Date().toISOString() : null,
  };

  const { data: creada, error } = await admin.from("solicitudes").insert(row).select("id").single();
  if (error || !creada) return { ok: false, error: "No se pudo crear el permiso. Intenta de nuevo." };

  const file = formData.get("soporte");
  if (file instanceof File && file.size > 0) {
    const path = `${cedula}/${creada.id}/${crypto.randomUUID()}.jpg`;
    const up = await admin.storage.from("permisos-soportes").upload(path, file, {
      contentType: file.type || "image/jpeg", upsert: false,
    });
    if (!up.error) {
      await admin.from("solicitudes").update({ soporte_path: path, soporte_subido_en: new Date().toISOString() }).eq("id", creada.id);
    }
  }
  return { ok: true, id: creada.id, pendiente: estado === "pendiente" };
}

// ── Subir soporte faltante (coordinador, sin límite de tiempo) ─────────────────
export async function subirSoporteCoord(formData: FormData): Promise<ResultadoDecision> {
  const s = await sesionCoordinador();
  if (!s.ok) return { ok: false, error: s.error };
  const id = Number(formData.get("id"));
  const file = formData.get("soporte");
  if (!Number.isInteger(id) || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Adjunta una foto válida." };
  }

  const admin = crearClienteAdmin();
  const { data: sol } = await admin
    .from("solicitudes").select("documento,centro_costo,soporte_path,para_director").eq("id", id).single();
  if (!sol) return { ok: false, error: "No encontramos la solicitud." };
  if (sol.soporte_path) return { ok: false, error: "Este permiso ya tiene soporte." };
  // Mismo alcance que la bandeja: el coordinador solo su área (no directivos); la
  // Dirección General, los permisos directivos. Sin límite de tiempo (a diferencia del colaborador).
  const permitido = s.esDirector ? sol.para_director : (s.areas.includes(sol.centro_costo) && !sol.para_director);
  if (!permitido) return { ok: false, error: "No puedes gestionar el soporte de este permiso." };

  const path = `${sol.documento}/${id}/${crypto.randomUUID()}.jpg`;
  const up = await admin.storage.from("permisos-soportes").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: false,
  });
  if (up.error) return { ok: false, error: "No se pudo subir la foto. Intenta de nuevo." };
  await admin.from("solicitudes").update({ soporte_path: path, soporte_subido_en: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}
