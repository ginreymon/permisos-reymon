// Cupo mensual por empleado, tipo y mes calendario (§4).
// Una sola implementación, usada por la vista previa del colaborador y por el
// reparto definitivo al aprobar.

import { calcularReparto, type Reparto } from "./reparto";
import { cicloNomina } from "./tiempo";
import type { CodigoTipo, EstadoSolicitud } from "../supabase/database.types";

export type ModoCupo = "preview" | "definitivo";

// Vista previa al solicitar: cuenta pendiente + aprobado + en_curso + cerrado.
const ESTADOS_PREVIEW: readonly EstadoSolicitud[] = ["pendiente", "aprobado", "en_curso", "cerrado"];
// Reparto definitivo al aprobar: solo aprobado + en_curso + cerrado.
const ESTADOS_DEFINITIVO: readonly EstadoSolicitud[] = ["aprobado", "en_curso", "cerrado"];

/** Fila mínima necesaria para calcular consumo de cupo. */
export interface SolicitudCupo {
  id?: number;
  tipo: CodigoTipo;
  fecha: string; // 'YYYY-MM-DD'
  estado: EstadoSolicitud;
  min_cubierto: number;
}

/** Minutos ya consumidos del cupo (solo la parte cubierta) para un tipo y ciclo de nómina. */
export function usadoEnMes(
  previas: readonly SolicitudCupo[],
  tipo: CodigoTipo,
  ciclo: string,
  modo: ModoCupo,
  excluirId?: number,
): number {
  const estados = modo === "preview" ? ESTADOS_PREVIEW : ESTADOS_DEFINITIVO;
  return previas
    .filter(
      (s) =>
        s.tipo === tipo &&
        cicloNomina(s.fecha) === ciclo &&
        estados.includes(s.estado) &&
        (excluirId === undefined || s.id !== excluirId),
    )
    .reduce((acc, s) => acc + s.min_cubierto, 0);
}

export interface CupoDelMes extends Reparto {
  tope: number | null;
  usado: number;
}

/** Cupo + reparto de un pedido nuevo. `previas` = solicitudes del mismo empleado. */
export function cupoDelMes(
  pedido: number,
  tope: number | null,
  previas: readonly SolicitudCupo[],
  tipo: CodigoTipo,
  fecha: string,
  modo: ModoCupo,
  excluirId?: number,
): CupoDelMes {
  const usado = usadoEnMes(previas, tipo, cicloNomina(fecha), modo, excluirId);
  return { ...calcularReparto(pedido, tope, usado), tope, usado };
}
