// Plazo del documento soporte (§4): 24 h después del regreso real; si no hubo
// regreso registrado, 24 h después del regreso autorizado. Vencido => todo se descuenta.

import { regresoAutorizado, sumarMinutos } from "./tiempo";

export const PLAZO_SOPORTE_MIN = 24 * 60;

export function vencimientoSoporte(
  regresoReal: Date | null,
  fecha: string,
  horaSalida: string,
  minutos: number,
): Date {
  const base = regresoReal ?? regresoAutorizado(fecha, horaSalida, minutos);
  return sumarMinutos(base, PLAZO_SOPORTE_MIN);
}

export function soporteVencido(
  ahora: Date,
  regresoReal: Date | null,
  fecha: string,
  horaSalida: string,
  minutos: number,
): boolean {
  return ahora.getTime() > vencimientoSoporte(regresoReal, fecha, horaSalida, minutos).getTime();
}
