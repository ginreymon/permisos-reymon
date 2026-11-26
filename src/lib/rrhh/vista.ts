import type { CodigoTipo, EstadoSolicitud } from "@/lib/supabase/database.types";

// Nombres de área para mostrar (el ERP los manda en mayúscula y sin tilde).
// La clave (centro_costo) no cambia; esto es solo presentación.
export const NOMBRE_AREA: Record<string, string> = {
  PRODUCCION: "Producción",
  LOGISTICA: "Logística",
  MANTENIMIENTO: "Mantenimiento",
  CALIDAD: "Calidad",
  "GERENCIA GENERAL Y FINANCIERA": "Gerencia general y financiera",
};

// ── Soporte (una idea: estado del documento) ─────────────────────────────────
export type SoporteTipo = "no_requiere" | "adjunto" | "pendiente" | "no_entregado" | "no_aplica";

// ── Descuento (una idea: qué va a nómina) ────────────────────────────────────
export type DescuentoTipo = "no_descontable" | "descontable" | "parcial" | "por_definir" | "no_aplica";

export interface RrhhVista {
  id: number;
  documento: string;
  nombre: string;
  area: string; // nombre para mostrar
  tipo: CodigoTipo;
  tipoNombre: string;
  fecha: string;
  fechaCorta: string; // "dd/mm"
  autorizado: string; // "HH:MM–HH:MM"
  real: string; // "HH:MM–HH:MM" | "HH:MM · sin regreso" | "—"
  realMin: number;
  minutos: number;
  duracion: string;
  estado: EstadoSolicitud;

  soporteTipo: SoporteTipo;
  venceEnMin: number | null; // solo si soporteTipo === "pendiente"

  descuentoTipo: DescuentoTipo;
  descuentoMin: number | null; // minutos que van a nómina
  descuentoTotal: number | null; // total del permiso (para "de 5 h" en parcial)
  descuentoRazon: string; // "permiso personal" | "sin soporte" | "cupo agotado" | "cupo del mes agotado" | "según soporte"

  sinRegreso: boolean;
  alertaRRHH: boolean;
}

export interface EstadoRRHH {
  permisos: RrhhVista[];
  areas: string[];
  ultimaSync: string | null;
  empleadosActivos: number;
}
