import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

// Sesión propia del colaborador (no usa Supabase Auth). Cookie httpOnly firmada y
// CIFRADA (AES-256-GCM) para no dejar datos personales en claro. Dura 30 min.

const COOKIE = "col_sesion";
const DURACION_S = 30 * 60;
const ALG = "aes-256-gcm";

function clave(): Buffer {
  const secret = process.env.COLABORADOR_SESSION_SECRET;
  if (!secret) throw new Error("Falta COLABORADOR_SESSION_SECRET");
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

export interface SesionColaborador {
  doc: string; // cédula
  nom: string; // nombre completo (solo servidor; al cliente va enmascarado)
  cc: string; // centro de costo (área)
  cargo: string; // cargo en siesa (define si el permiso va a Dirección General)
  iat: number; // emitido en (epoch s)
}

function cifrar(payload: Omit<SesionColaborador, "iat">): string {
  const datos: SesionColaborador = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, clave(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(datos), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function descifrar(token: string): SesionColaborador | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALG, clave(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const s = JSON.parse(dec) as SesionColaborador;
    if (Math.floor(Date.now() / 1000) - s.iat > DURACION_S) return null; // expirada
    return s;
  } catch {
    return null;
  }
}

export async function crearSesion(payload: Omit<SesionColaborador, "iat">): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, cifrar(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_S,
  });
}

export async function leerSesion(): Promise<SesionColaborador | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  return token ? descifrar(token) : null;
}

export async function borrarSesion(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
