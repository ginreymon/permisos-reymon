// Vista de portería: una persona con permiso de hoy, lista para que el vigilante
// registre su salida o su regreso reales.

export type AccionPorteria = "salida" | "regreso";

export interface PortVista {
  id: number;
  movimientoAbierto: number | null; // id del movimiento de salida (para deshacer/regreso)
  documento: string;
  nombre: string;
  area: string;
  fecha: string; // "YYYY-MM-DD" del permiso
  fechaCorta: string; // "dd/mm"
  esHoy: boolean; // el permiso es para hoy (Bogotá)
  salida: string; // "HH:MM" autorizada
  regreso: string; // "HH:MM" autorizada (salida + minutos)
  estado: "aprobado" | "en_curso";
  salioA: string | null; // "HH:MM" real, si ya salió
  tarde: boolean; // fuera y pasado de la hora de regreso
}

export type ResultadoPorteria =
  | { ok: true; estado: PortVista[] }
  | { ok: false; error: string };

export type ResultadoLoginPorteria = { ok: true } | { ok: false; error: string };

/** "HH:MM" -> minutos del día. */
export function minutosDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Iniciales para el avatar: primeras letras de las dos primeras palabras largas. */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
