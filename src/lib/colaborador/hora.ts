// Conversiones hora-rueda (12h AM/PM) <-> "HH:MM" 24h, y sumas. Puras (cliente/servidor).

export type MerIdiem = "AM" | "PM";

/** (12h, min, AM/PM) -> "HH:MM" 24h. */
export function a24(h12: number, mm: number, ap: MerIdiem): string {
  let h = h12 % 12;
  if (ap === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "HH:MM" 24h -> {h12, mm, ap}. */
export function desde24(hhmm: string): { h12: number; mm: number; ap: MerIdiem } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h12: h % 12 === 0 ? 12 : h % 12, mm: m, ap: h >= 12 ? "PM" : "AM" };
}

/** Próxima hora en punto (Bogotá), como "HH:00". */
export function horaProximaEnPunto(): string {
  const bog = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const h = (bog.getHours() + 1) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

/** "HH:MM" + minutos (con rollover de día) -> "HH:MM". */
export function sumarMinutosHora(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** minutos desde medianoche -> "HH:MM" 24h. */
export function minutosAHHMM(min: number): string {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Próximo cuarto de hora (minutos desde medianoche, hora de Bogotá). */
export function proximoCuartoBogota(): number {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return Math.ceil((b.getHours() * 60 + b.getMinutes()) / 15) * 15;
}

/** Instante actual + 24 h en Bogotá: { fecha:'YYYY-MM-DD', minutos desde medianoche }. */
export function limite24hBogota(): { fecha: string; minutos: number } {
  const b = new Date(new Date(Date.now() + 24 * 3600_000).toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const fecha = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}-${String(b.getDate()).padStart(2, "0")}`;
  return { fecha, minutos: b.getHours() * 60 + b.getMinutes() };
}

/** 'YYYY-MM-DD' + 1 día. */
export function diaSiguiente(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "HH:MM" 24h -> "3:30 p. m." (es-CO). */
export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
