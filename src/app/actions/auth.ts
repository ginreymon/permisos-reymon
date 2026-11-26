"use server";

import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoIngreso =
  | { ok: true; destino: string }
  | { ok: false; error: string };

// Login unificado del staff (coordinador/portería/RRHH). Un solo formulario:
// autentica con Supabase y enruta según el rol devuelto por la RPC `mi_rol`.
export async function ingresar(formData: FormData): Promise<ResultadoIngreso> {
  const email = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("clave") ?? "");
  if (!email || !password) return { ok: false, error: "Escribe tu correo y contraseña." };

  const supa = await crearClienteServidor();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Correo o contraseña incorrectos." };

  const { data: rol } = await supa.rpc("mi_rol");
  const destino =
    rol === "coordinador" ? "/coordinador"
    : rol === "porteria" ? "/porteria"
    : rol === "rrhh" ? "/rrhh"
    : null;

  if (!destino) {
    await supa.auth.signOut();
    return { ok: false, error: "Esta cuenta no tiene un rol asignado." };
  }
  return { ok: true, destino };
}
