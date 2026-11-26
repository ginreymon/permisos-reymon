// Formato de presentación (cliente y servidor). es-CO.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Minutos -> "3 h", "45 min", "1 h 30 min". */
export function fmtDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

/** Duración legible larga (aria): "1 hora 30 minutos", "45 minutos", "2 horas". */
export function fmtDuracionLarga(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const partes: string[] = [];
  if (h) partes.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m) partes.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  return partes.join(" ") || "0 minutos";
}

/** 'YYYY-MM-DD' -> "Vie 3 oct" (es-CO). */
export function fmtFechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 'YYYY-MM-DD' + 'HH:MM' -> "05 sep · 07:00". */
export function fmtFechaHora(fecha: string, hora: string): string {
  const [, me, d] = fecha.split("-");
  const hhmm = hora.slice(0, 5);
  return `${String(+d).padStart(2, "0")} ${MESES[+me - 1]} · ${hhmm}`;
}

/** Timestamptz ISO -> "Hoy, 4:40 p. m." / "27 ago, 4:40 p. m." (hora de Bogotá). */
export function fmtRadicado(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  const dDia = d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  if (hoy === dDia) return `Hoy, ${hora}`;
  const partes = d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Bogota",
  });
  return `${partes}, ${hora}`;
}
