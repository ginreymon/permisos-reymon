// Clasificación para RRHH (§4). Solo aplica a 'aprobado' y 'cerrado'; el resto = 'No aplica'.
// `minDescontables` = minutos que van a nómina (null = indeterminado, aún pendiente).

import type { EstadoSolicitud } from "../supabase/database.types";

export type ClaseCodigo =
  | "no_aplica"
  | "descontable"
  | "soporte_pendiente"
  | "sin_soporte"
  | "no_descontable"
  | "cupo_agotado"
  | "repartido";

export interface Clasificacion {
  codigo: ClaseCodigo;
  etiqueta: string;
  minDescontables: number | null;
}

export interface EntradaClasificacion {
  estado: EstadoSolicitud;
  tipoEsPersonal: boolean;
  exigeSoporte: boolean;
  tieneSoporte: boolean;
  plazoVencido: boolean;
  minutos: number;
  minCubierto: number;
  minPersonal: number;
}

export function clasificar(e: EntradaClasificacion): Clasificacion {
  if (e.estado !== "aprobado" && e.estado !== "cerrado") {
    return { codigo: "no_aplica", etiqueta: "No aplica", minDescontables: null };
  }
  // Personal: siempre se descuenta (va primero: no tiene cupo ni soporte).
  if (e.tipoEsPersonal) {
    return { codigo: "descontable", etiqueta: "Descontable", minDescontables: e.minutos };
  }
  // Exige soporte y no lo tiene: depende del plazo.
  if (e.exigeSoporte && !e.tieneSoporte) {
    return e.plazoVencido
      ? { codigo: "sin_soporte", etiqueta: "Descontable · sin soporte", minDescontables: e.minutos }
      : { codigo: "soporte_pendiente", etiqueta: "Soporte pendiente", minDescontables: null };
  }
  // Con soporte (o no lo exige): clasifica por reparto de cupo.
  if (e.minPersonal === 0) {
    return { codigo: "no_descontable", etiqueta: "No descontable", minDescontables: 0 };
  }
  if (e.minCubierto === 0) {
    return { codigo: "cupo_agotado", etiqueta: "Descontable · cupo agotado", minDescontables: e.minutos };
  }
  return {
    codigo: "repartido",
    etiqueta: `Descontable ${e.minPersonal} (repartido)`,
    minDescontables: e.minPersonal,
  };
}
