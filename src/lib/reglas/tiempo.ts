// Tiempo en zona horaria de Colombia. America/Bogota es UTC-5 fijo (sin horario de verano),
// así que el offset es constante y los cálculos son deterministas.

export const OFFSET_BOGOTA = "-05:00";

/** Mes calendario ('YYYY-MM') de una fecha 'YYYY-MM-DD' (ya en fecha local de Bogotá). */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/**
 * Ciclo de nómina: corte del 25 de un mes al 24 del siguiente.
 * Devuelve 'YYYY-MM' del mes en que cierra el ciclo (el día 24).
 * Día 1..24 -> ciclo cierra este mes; día 25..31 -> ciclo cierra el mes siguiente.
 * Ej.: 2026-09-24 -> '2026-09'; 2026-09-25 -> '2026-10'.
 */
export function cicloNomina(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  let yy = y, mm = m;
  if (d >= 25) {
    mm += 1;
    if (mm > 12) { mm = 1; yy += 1; }
  }
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

/** Instante exacto (Date UTC) de una fecha+hora de Bogotá. `hora` acepta 'HH:MM' o 'HH:MM:SS'. */
export function instanteBogota(fecha: string, hora: string): Date {
  const hhmm = hora.slice(0, 5);
  return new Date(`${fecha}T${hhmm}:00${OFFSET_BOGOTA}`);
}

export function sumarMinutos(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

/** Regreso autorizado = salida (Bogotá) + duración del permiso. */
export function regresoAutorizado(fecha: string, horaSalida: string, minutos: number): Date {
  return sumarMinutos(instanteBogota(fecha, horaSalida), minutos);
}
