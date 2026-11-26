import { fmtDuracion } from "@/lib/colaborador/formato";
import type { CodigoTipo, EstadoSolicitud } from "@/lib/supabase/database.types";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const NOMBRE_TIPO: Record<CodigoTipo, string> = {
  PP: "Permiso personal",
  PM: "Permiso médico",
  PA: "Permiso por ARL",
  PE: "Permiso por actividades escolares",
};

/** Etiqueta corta para el badge: "Personal", "Médico", "ARL", "Actividades escolares". */
export const TIPO_CORTO: Record<CodigoTipo, string> = {
  PP: "Personal",
  PM: "Médico",
  PA: "ARL",
  PE: "Actividades escolares",
};

/** 'YYYY-MM-DD' -> "Hoy" | "Mañana" | "18 sep". */
export function fmtFechaRelativa(fecha: string, hoy: string, manana: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === manana) return "Mañana";
  const [, m, d] = fecha.split("-");
  return `${+d} ${MESES[+m - 1]}`;
}

/** Timestamptz ISO -> "Hace 20 minutos" | "Ayer" | "18 sep". */
export function fmtHace(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Hace un momento";
  const min = Math.floor(s / 60);
  if (min < 60) return `Hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" });
}

/** Texto de contexto de uso (últimos 60 días). Neutral, no alerta. */
export function historialTexto(items: { tipo: CodigoTipo; minutos: number }[]): string {
  if (!items.length) return "Sin permisos en los últimos 60 días.";
  const n = items.length;
  const min = items.reduce((a, i) => a + i.minutos, 0);
  const cuenta = new Map<CodigoTipo, number>();
  for (const i of items) cuenta.set(i.tipo, (cuenta.get(i.tipo) ?? 0) + 1);
  const etiqueta: Record<CodigoTipo, [string, string]> = {
    PP: ["personal", "personales"],
    PM: ["médico", "médicos"],
    PA: ["de ARL", "de ARL"],
    PE: ["escolar", "escolares"],
  };
  const d = [...cuenta.entries()].map(([t, c]) => `${c} ${etiqueta[t][c === 1 ? 0 : 1]}`);
  return `Últimos 60 días: ${n} ${n === 1 ? "permiso" : "permisos"} (${d.join(", ")}), ${fmtDuracion(min)}.`;
}

export interface CoordVista {
  id: number;
  documento: string;
  nombre: string;
  tipo: CodigoTipo;
  tipoNombre: string;
  tipoCorto: string;
  fecha: string; // raw
  fechaTexto: string; // "Hoy" | "18 sep"
  salida: string; // "HH:MM"
  regreso: string; // "HH:MM"
  duracion: string;
  minutos: number;
  radicado: string; // "Hace 20 minutos"
  estado: EstadoSolicitud;
  observaciones: string | null;
  exigeSoporte: boolean;
  tieneSoporte: boolean;
  faltaSoporte: boolean;
  historial: string;
  solapado: string | null;
  salidaReal: string | null; // "HH:MM" Bogotá
  regresoReal: string | null;
  motivoRechazo: string | null;
  comentario: string | null;
}

export type ResultadoDecision = { ok: true } | { ok: false; error: string };
