// Utilidades de identidad/presentación del colaborador. Puras (cliente o servidor).

/** Normaliza para comparar: sin tildes, minúsculas, sin espacios extra. */
export function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/** Solo dígitos (cédula). */
export function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Cargo directivo (coordinador o jefe): sus permisos no los aprueba un coordinador
 * par, sino la Dirección General. Se detecta sobre el `cargo` de siesa (empleados_act).
 * Si el campo viene vacío -> false -> ruta normal.
 */
export function esCargoDirectivo(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  const c = normalizar(cargo);
  return c.includes("coordinador") || c.includes("jefe");
}

/**
 * Cargo de portería (PORTERO): como los directivos, sus permisos los aprueba la
 * Dirección General, no un coordinador par. Se enrutan con `para_director`.
 */
export function esCargoPorteria(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  const c = normalizar(cargo);
  return c.includes("porter"); // "portero", "portera", "porteria"
}

/**
 * Primer apellido a partir del nombre de Siesa (APELLIDOS primero).
 * Normaliza dobles espacios; devuelve el primer token normalizado.
 */
export function primerApellido(nombreSiesa: string): string {
  return normalizar(nombreSiesa).split(" ")[0] ?? "";
}

const PALABRAS_MINUS = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "los", "el", "en", "a"]);

/** Formato título en es-CO: "GERENCIA GENERAL Y FINANCIERA" -> "Gerencia General y Financiera". */
export function aTitulo(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && PALABRAS_MINUS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Un token -> 2 letras visibles + '***' (habeas data). "" si no hay token. */
function maskToken(t?: string): string {
  return t ? t.slice(0, 2).toUpperCase() + "***" : "";
}

/**
 * Habeas data: deja solo primer nombre + primer apellido, cada uno con 2 letras + '***'.
 * El nombre Siesa viene con APELLIDOS primero. Heurística (es-CO, usualmente 2 apellidos):
 *   tok[0] = primer apellido; primer nombre = tok[2] si hay >=3 tokens, si no tok[1].
 * Muestra "Nombre Apellido": ej. "JU*** PE***".
 */
export function enmascararNombre(nombreSiesa: string): string {
  const toks = nombreSiesa.trim().split(/\s+/).filter(Boolean);
  const apellido = toks[0];
  const nombre = toks.length >= 3 ? toks[2] : toks[1];
  return [maskToken(nombre), maskToken(apellido)].filter(Boolean).join(" ");
}

/** Cédula: solo últimos 4 dígitos visibles, el resto '*'. Ej. "1234567" -> "***4567". */
export function enmascararCedula(cedula: string): string {
  const d = soloDigitos(cedula);
  if (d.length <= 4) return d;
  return "*".repeat(d.length - 4) + d.slice(-4);
}
