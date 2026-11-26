"use server";

import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { aTitulo, esCargoDirectivo, esCargoPorteria } from "@/lib/colaborador/identidad";
import { sumarMinutosHora } from "@/lib/colaborador/hora";
import { cupoDelMes, instanteBogota, type SolicitudCupo } from "@/lib/reglas";
import {
  minutosDia, type PortVista, type ResultadoPorteria, type ResultadoLoginPorteria,
} from "@/lib/porteria/vista";
import type { EmpleadoCoord, ResultadoEmpleado, ResultadoCrearCoord } from "@/app/actions/coordinador";
import type { EstadoSolicitud, Database } from "@/lib/supabase/database.types";

type SolicitudInsert = Database["permisos"]["Tables"]["solicitudes"]["Insert"];

const MS_24H = 24 * 3600 * 1000; // anticipación mínima (misma regla del colaborador)

const COLS = "id,documento,nombre,centro_costo,fecha,hora_salida,minutos,estado,salida_real";

interface Fila {
  id: number; documento: string; nombre: string; centro_costo: string; fecha: string;
  hora_salida: string; minutos: number; estado: EstadoSolicitud; salida_real: string | null;
}

/** ISO Bogotá ("HH:MM") de un timestamptz. */
function hhmmBogota(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  });
}

/** Fecha de hoy en Bogotá, "YYYY-MM-DD". */
function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** "HH:MM" marcado en portería -> timestamptz ISO de hoy (Bogotá, sin horario de verano: -05:00). */
function marcaATimestamp(hhmm: string): string {
  return new Date(`${hoyBogota()}T${hhmm}:00-05:00`).toISOString();
}

/** Minutos del día ahora mismo en Bogotá. */
function ahoraMinBogota(): number {
  return minutosDia(
    new Date().toLocaleTimeString("es-CO", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
    }),
  );
}

async function cargar(): Promise<PortVista[]> {
  const supa = await crearClienteServidor();
  // RLS (sol_porteria_read) ya limita a: en_curso + aprobado de hoy.
  const { data: filasRaw } = await supa
    .from("solicitudes").select(COLS)
    .order("fecha", { ascending: true }).order("hora_salida", { ascending: true });
  const filas = (filasRaw ?? []) as Fila[];
  if (!filas.length) return [];

  // Movimiento de salida abierto por solicitud (para deshacer y enlazar el regreso).
  const ids = filas.map((f) => f.id);
  const { data: movsRaw } = await supa
    .from("movimientos_porteria")
    .select("id,solicitud_id,tipo")
    .in("solicitud_id", ids).eq("tipo", "salida").eq("anulado", false);
  const movSalida = new Map<number, number>();
  for (const m of (movsRaw ?? []) as { id: number; solicitud_id: number }[]) {
    movSalida.set(m.solicitud_id, m.id);
  }

  const ahora = ahoraMinBogota();
  const hoy = hoyBogota();
  return filas
    .filter((f) => f.estado === "aprobado" || f.estado === "en_curso")
    .map((f) => {
      const salida = f.hora_salida.slice(0, 5);
      const regreso = sumarMinutosHora(salida, f.minutos);
      const enCurso = f.estado === "en_curso";
      const esHoy = f.fecha === hoy;
      return {
        id: f.id,
        movimientoAbierto: movSalida.get(f.id) ?? null,
        documento: f.documento,
        nombre: f.nombre,
        area: aTitulo(f.centro_costo),
        fecha: f.fecha,
        fechaCorta: `${f.fecha.slice(8)}/${f.fecha.slice(5, 7)}`,
        esHoy,
        salida, regreso,
        estado: f.estado as "aprobado" | "en_curso",
        salioA: hhmmBogota(f.salida_real),
        tarde: enCurso && esHoy && ahora > minutosDia(regreso),
      } satisfies PortVista;
    });
}

/** Estado del tablero. null = no autenticado / no es portería. */
export async function estadoPorteria(): Promise<PortVista[] | null> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "porteria") return null;
  return cargar();
}

// ── Login / logout ────────────────────────────────────────────────────────────
export async function iniciarSesion(formData: FormData): Promise<ResultadoLoginPorteria> {
  const email = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("clave") ?? "");
  if (!email || !password) return { ok: false, error: "Escribe el usuario y la contraseña." };

  const supa = await crearClienteServidor();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Usuario o contraseña incorrectos." };

  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "porteria") {
    await supa.auth.signOut();
    return { ok: false, error: "Esta cuenta no es de portería." };
  }
  return { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  const supa = await crearClienteServidor();
  await supa.auth.signOut();
}

// ── Registrar salida real ───────────────────────────────────────────────────
export async function registrarSalida(id: number, hhmm: string): Promise<ResultadoPorteria> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const marca = marcaATimestamp(hhmm);
  const { error: eMov } = await supa.from("movimientos_porteria").insert({
    client_id: crypto.randomUUID(), solicitud_id: id, tipo: "salida",
    hora_marcada: marca, registrado_por: user.id,
  });
  if (eMov) return { ok: false, error: "No se pudo registrar la salida." };

  const { error: eSol } = await supa
    .from("solicitudes")
    .update({ estado: "en_curso", salida_real: marca })
    .eq("id", id).eq("estado", "aprobado");
  if (eSol) return { ok: false, error: "No se pudo actualizar el permiso." };

  return { ok: true, estado: await cargar() };
}

// ── Registrar regreso real ────────────────────────────────────────────────────
export async function registrarRegreso(id: number, hhmm: string): Promise<ResultadoPorteria> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const marca = marcaATimestamp(hhmm);
  const { error: eMov } = await supa.from("movimientos_porteria").insert({
    client_id: crypto.randomUUID(), solicitud_id: id, tipo: "regreso",
    hora_marcada: marca, registrado_por: user.id,
  });
  if (eMov) return { ok: false, error: "No se pudo registrar el regreso." };

  const { error: eSol } = await supa
    .from("solicitudes")
    .update({ estado: "cerrado", regreso_real: marca })
    .eq("id", id).eq("estado", "en_curso");
  if (eSol) return { ok: false, error: "No se pudo actualizar el permiso." };

  return { ok: true, estado: await cargar() };
}

// ── Deshacer (un toque equivocado no debe ser definitivo) ─────────────────────
export async function deshacer(
  solicitudId: number, accion: "salida" | "regreso", movimientoId: number | null,
): Promise<ResultadoPorteria> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  if (movimientoId != null) {
    await supa.from("movimientos_porteria").update({ anulado: true }).eq("id", movimientoId);
  } else {
    // Sin id conocido: anular el último movimiento vivo de ese tipo.
    const { data: m } = await supa
      .from("movimientos_porteria").select("id")
      .eq("solicitud_id", solicitudId).eq("tipo", accion).eq("anulado", false)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (m) await supa.from("movimientos_porteria").update({ anulado: true }).eq("id", m.id);
  }

  const revert = accion === "salida"
    ? { estado: "aprobado" as const, salida_real: null, from: "en_curso" as const }
    : { estado: "en_curso" as const, regreso_real: null, from: "cerrado" as const };
  const patch = accion === "salida"
    ? { estado: revert.estado, salida_real: revert.salida_real }
    : { estado: revert.estado, regreso_real: revert.regreso_real };

  const { error } = await supa
    .from("solicitudes").update(patch).eq("id", solicitudId).eq("estado", revert.from);
  if (error) return { ok: false, error: "No se pudo deshacer." };

  return { ok: true, estado: await cargar() };
}

// ── Mis permisos (el portero pide un permiso para sí mismo) ───────────────────
// La cuenta ya identifica a la persona: no se pide la cédula. Regla de 24 h como el
// colaborador y aprobación de la Dirección General.

/** Valida portería y devuelve la cédula vinculada a la cuenta (usuarios.documento). */
async function sesionPorteria() {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false as const, error: "Tu sesión expiró." };
  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "porteria") return { ok: false as const, error: "Solo portería puede hacer esto." };
  const { data: u } = await supa
    .from("usuarios").select("documento").eq("user_id", user.id).maybeSingle();
  return { ok: true as const, user, documento: (u?.documento ?? null) as string | null };
}

/** El empleado dueño de la cuenta de portería, para prellenar "Solicitud". */
export async function miEmpleadoPorteria(): Promise<ResultadoEmpleado> {
  const s = await sesionPorteria();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.documento) {
    return { ok: false, error: "Tu cuenta no está vinculada a un empleado. Avísale a Talento Humano." };
  }

  const admin = crearClienteAdmin();
  const { data: emp } = await admin.rpc("empleado_por_documento", { p_doc: s.documento });
  const fila = Array.isArray(emp) ? emp[0] : null;
  if (!fila) return { ok: false, error: "No encontramos tu registro de empleado activo." };

  const { data: previasRaw } = await admin
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", s.documento);

  const empleado: EmpleadoCoord = {
    documento: fila.documento, nombre: fila.nombre, area: fila.centro_costo,
    cargo: fila.cargo ?? "", esDirectivo: esCargoDirectivo(fila.cargo),
  };
  return { ok: true, empleado, previas: (previasRaw ?? []) as SolicitudCupo[] };
}

const esquemaCrearPorteria = z.object({
  tipo: z.enum(["PP", "PM", "PA", "PE"]),
  horas: z.coerce.number().int().min(0).max(8),
  minutos: z.coerce.number().int().min(0).max(59),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "hora inválida"),
  observaciones: z.string().max(500).optional(),
});

/** Crea el permiso del propio portero (cédula tomada de la cuenta, no del formulario). */
export async function crearMiPermisoPorteria(formData: FormData): Promise<ResultadoCrearCoord> {
  const s = await sesionPorteria();
  if (!s.ok) return { ok: false, error: s.error };
  if (!s.documento) return { ok: false, error: "Tu cuenta no está vinculada a un empleado." };

  const parsed = esquemaCrearPorteria.safeParse({
    tipo: formData.get("tipo"),
    horas: formData.get("horas"),
    minutos: formData.get("minutos"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    observaciones: formData.get("observaciones") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Revisa los datos del permiso." };
  const d = parsed.data;
  const cedula = s.documento; // siempre la del dueño de la cuenta
  const minutos = d.horas * 60 + d.minutos;
  if (minutos <= 0) return { ok: false, error: "La duración no puede ser cero." };

  // Misma regla del colaborador: al menos 24 h de anticipación.
  if (instanteBogota(d.fecha, d.hora).getTime() - Date.now() < MS_24H) {
    return { ok: false, error: "El permiso debe solicitarse al menos 24 horas antes de la hora de salida." };
  }

  const admin = crearClienteAdmin();
  const { data: emp } = await admin.rpc("empleado_por_documento", { p_doc: cedula });
  const fila = Array.isArray(emp) ? emp[0] : null;
  if (!fila) return { ok: false, error: "No encontramos tu registro de empleado activo." };

  const { data: tp } = await admin.from("tipos_permiso").select("tope_min_mes").eq("codigo", d.tipo).single();
  const { data: previasRaw } = await admin
    .from("solicitudes").select("tipo,fecha,estado,min_cubierto").eq("documento", cedula);
  const reparto = cupoDelMes(
    minutos, tp?.tope_min_mes ?? null, (previasRaw ?? []) as SolicitudCupo[], d.tipo, d.fecha, "preview",
  );

  const row: SolicitudInsert = {
    documento: cedula, nombre: fila.nombre, centro_costo: fila.centro_costo,
    tipo: d.tipo, fecha: d.fecha, hora_salida: d.hora, minutos,
    observaciones: d.observaciones ?? null,
    min_cubierto: reparto.cubierto, min_personal: reparto.personal,
    estado: "pendiente", creado_por: s.user.id,
    // PORTERO (y otros directivos) los aprueba la Dirección General.
    para_director: esCargoDirectivo(fila.cargo) || esCargoPorteria(fila.cargo),
  };

  const { data: creada, error } = await admin.from("solicitudes").insert(row).select("id").single();
  if (error || !creada) return { ok: false, error: "No se pudo enviar la solicitud. Intenta de nuevo." };

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
  return { ok: true, id: creada.id, pendiente: true };
}
