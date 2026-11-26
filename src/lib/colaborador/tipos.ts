import type { CodigoTipo, EstadoSolicitud } from "../supabase/database.types";

// Copy de los nombres de tipo tal como en el prototipo.
export const NOMBRE_TIPO: Record<CodigoTipo, string> = {
  PP: "Permiso personal",
  PM: "Permiso médico",
  PA: "Permiso por ARL",
  PE: "Permiso por actividades escolares",
};

export interface TipoCatalogo {
  codigo: CodigoTipo;
  nombre: string; // display ("Permiso médico")
  topeMinMes: number | null;
  exigeSoporte: boolean;
}

export interface IdentidadVista {
  cedula: string;
  nombreMask: string;
  area: string;
}

export interface PermisoVista {
  id: number;
  tipo: CodigoTipo;
  tipoNombre: string;
  minutos: number;
  minCubierto: number;
  minPersonal: number;
  duracion: string; // "3 h"
  fecha: string; // raw 'YYYY-MM-DD' (para recálculo de cupo en cliente)
  fechaHora: string; // "05 sep · 07:00"
  radicado: string; // "Hoy, 4:40 p. m."
  estado: EstadoSolicitud;
  exigeSoporte: boolean;
  tieneSoporte: boolean;
  faltaSoporte: boolean; // badge "Falta soporte"
  plazoVencido: boolean;
  motivoRechazo: string | null;
  comentario: string | null;
}

export type ResultadoIdentidad =
  | { ok: true; identidad: IdentidadVista; permisos: PermisoVista[] }
  | { ok: false; error: string };

export type ResultadoCrear = { ok: true; id: number } | { ok: false; error: string };
export type ResultadoSimple = { ok: true; permisos: PermisoVista[] } | { ok: false; error: string };
