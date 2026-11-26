"use server";

import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { aTitulo } from "@/lib/colaborador/identidad";
import { sumarMinutosHora } from "@/lib/colaborador/hora";
import { fmtDuracion } from "@/lib/colaborador/formato";
import { clasificar, soporteVencido, vencimientoSoporte } from "@/lib/reglas";
import {
  NOMBRE_AREA, type DescuentoTipo, type EstadoRRHH, type RrhhVista, type SoporteTipo,
} from "@/lib/rrhh/vista";
import type { CodigoTipo, EstadoSolicitud } from "@/lib/supabase/database.types";

const TIPO_NOMBRE: Record<CodigoTipo, string> = {
  PP: "Personal", PM: "Médico", PA: "ARL", PE: "Escolar",
};

const COLS =
  "id,documento,nombre,centro_costo,tipo,fecha,hora_salida,minutos,min_cubierto,min_personal," +
  "estado,soporte_path,salida_real,regreso_real,sin_regreso,alerta_rrhh";

interface Fila {
  id: number; documento: string; nombre: string; centro_costo: string; tipo: CodigoTipo;
  fecha: string; hora_salida: string; minutos: number; min_cubierto: number; min_personal: number;
  estado: EstadoSolicitud; soporte_path: string | null;
  salida_real: string | null; regreso_real: string | null; sin_regreso: boolean; alerta_rrhh: boolean;
}

function hhmmBogota(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  });
}

interface Descuento { tipo: DescuentoTipo; min: number | null; total: number | null; razon: string }

/** Traduce la clasificación de reglas a la columna Descuento (una idea por fila). */
function aDescuento(codigo: string, minutos: number, minPersonal: number): Descuento {
  switch (codigo) {
    case "descontable": return { tipo: "descontable", min: minutos, total: null, razon: "permiso personal" };
    case "sin_soporte": return { tipo: "descontable", min: minutos, total: null, razon: "sin soporte" };
    case "cupo_agotado": return { tipo: "descontable", min: minutos, total: null, razon: "cupo agotado" };
    case "no_descontable": return { tipo: "no_descontable", min: 0, total: null, razon: "" };
    case "soporte_pendiente": return { tipo: "por_definir", min: null, total: null, razon: "según soporte" };
    case "repartido": return { tipo: "parcial", min: minPersonal, total: minutos, razon: "cupo del mes agotado" };
    default: return { tipo: "no_aplica", min: null, total: null, razon: "" };
  }
}

/** Estado de la vista RRHH. null = no autenticado / no es RRHH. */
export async function estadoRRHH(): Promise<EstadoRRHH | null> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "rrhh") return null;

  const [{ data: tiposRaw }, { data: filasRaw }, { data: syncRaw }] = await Promise.all([
    supa.from("tipos_permiso").select("codigo,exige_soporte"),
    supa.from("solicitudes").select(COLS).order("id", { ascending: false }),
    supa.rpc("resumen_sync"),
  ]);
  const exige = new Map((tiposRaw ?? []).map((t) => [t.codigo, t.exige_soporte]));
  const filas = (filasRaw ?? []) as unknown as Fila[];
  const sync = (syncRaw ?? [])[0] as { ultima_sync: string | null; empleados_activos: number } | undefined;

  const ahora = new Date();
  const permisos: RrhhVista[] = filas.map((f) => {
    const salida = f.hora_salida.slice(0, 5);
    const regresoAut = sumarMinutosHora(salida, f.minutos);
    const exigeSoporte = exige.get(f.tipo) ?? false;
    const tieneSoporte = !!f.soporte_path;
    const regresoReal = f.regreso_real ? new Date(f.regreso_real) : null;
    const plazoVencido = exigeSoporte && !tieneSoporte &&
      soporteVencido(ahora, regresoReal, f.fecha, f.hora_salida, f.minutos);
    const activo = f.estado === "aprobado" || f.estado === "en_curso" || f.estado === "cerrado";

    // ── Soporte ──
    let soporteTipo: SoporteTipo;
    let venceEnMin: number | null = null;
    if (!activo) soporteTipo = "no_aplica";
    else if (!exigeSoporte) soporteTipo = "no_requiere";
    else if (tieneSoporte) soporteTipo = "adjunto";
    else if (plazoVencido) soporteTipo = "no_entregado";
    else {
      soporteTipo = "pendiente";
      const vence = vencimientoSoporte(regresoReal, f.fecha, f.hora_salida, f.minutos);
      venceEnMin = Math.round((vence.getTime() - ahora.getTime()) / 60000);
    }

    // ── Descuento (reusa la clasificación probada) ──
    const clase = clasificar({
      estado: f.estado, tipoEsPersonal: f.tipo === "PP", exigeSoporte, tieneSoporte,
      plazoVencido, minutos: f.minutos, minCubierto: f.min_cubierto, minPersonal: f.min_personal,
    });
    const d = aDescuento(clase.codigo, f.minutos, f.min_personal);

    // ── Horas (compactas, una línea) ──
    const salidaR = hhmmBogota(f.salida_real);
    const regresoR = hhmmBogota(f.regreso_real);
    let real = "—";
    let realMin = 0;
    if (salidaR && f.sin_regreso) {
      real = `${salidaR} · sin regreso`;
      realMin = f.minutos;
    } else if (salidaR && regresoR) {
      real = `${salidaR}–${regresoR}`;
      realMin = Math.round((new Date(f.regreso_real!).getTime() - new Date(f.salida_real!).getTime()) / 60000);
    } else if (salidaR) {
      real = `${salidaR}–—`;
    }

    return {
      id: f.id, documento: f.documento, nombre: f.nombre,
      area: NOMBRE_AREA[f.centro_costo] ?? aTitulo(f.centro_costo),
      tipo: f.tipo, tipoNombre: TIPO_NOMBRE[f.tipo],
      fecha: f.fecha, fechaCorta: `${f.fecha.slice(8)}/${f.fecha.slice(5, 7)}`,
      autorizado: `${salida}–${regresoAut}`,
      real, realMin, minutos: f.minutos, duracion: fmtDuracion(f.minutos),
      estado: f.estado,
      soporteTipo, venceEnMin,
      descuentoTipo: d.tipo, descuentoMin: d.min, descuentoTotal: d.total, descuentoRazon: d.razon,
      sinRegreso: f.sin_regreso, alertaRRHH: f.alerta_rrhh,
    } satisfies RrhhVista;
  });

  const areas = [...new Set(permisos.map((p) => p.area))].sort();
  return {
    permisos, areas,
    ultimaSync: sync?.ultima_sync ?? null,
    empleadosActivos: sync?.empleados_activos ?? 0,
  };
}

// ── Login / logout ────────────────────────────────────────────────────────────
export async function iniciarSesion(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("clave") ?? "");
  if (!email || !password) return { ok: false, error: "Escribe tu correo y contraseña." };

  const supa = await crearClienteServidor();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Correo o contraseña incorrectos." };

  const { data: rol } = await supa.rpc("mi_rol");
  if (rol !== "rrhh") {
    await supa.auth.signOut();
    return { ok: false, error: "Esta cuenta no es de Talento Humano." };
  }
  return { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  const supa = await crearClienteServidor();
  await supa.auth.signOut();
}

// ── Ver soporte (URL firmada corta) ──────────────────────────────────────────
export async function verSoporte(id: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supa = await crearClienteServidor();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };
  const { data: sol } = await supa.from("solicitudes").select("soporte_path").eq("id", id).single();
  if (!sol?.soporte_path) return { ok: false, error: "No hay documento soporte." };

  const admin = crearClienteAdmin();
  const { data, error } = await admin.storage.from("permisos-soportes").createSignedUrl(sol.soporte_path, 300);
  if (error || !data) return { ok: false, error: "No se pudo abrir el soporte." };
  return { ok: true, url: data.signedUrl };
}
