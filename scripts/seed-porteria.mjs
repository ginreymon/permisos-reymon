// Crea (o reutiliza) un usuario de portería de prueba + su fila en permisos.usuarios.
// Uso: node scripts/seed-porteria.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, db: { schema: "permisos" },
});

const EMAIL = "porteria.principal@reymon.test";
const PASSWORD = "Reymon2026*";

let userId;
const creado = await auth.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (creado.error) {
  if (!creado.error.message.toLowerCase().includes("already")) throw creado.error;
  const { data } = await auth.auth.admin.listUsers({ perPage: 1000 });
  userId = data.users.find((u) => u.email === EMAIL)?.id;
} else {
  userId = creado.data.user.id;
}

const up = await db.from("usuarios").upsert(
  { user_id: userId, rol: "porteria", nombre_cargo: "Portería principal", activo: true },
  { onConflict: "user_id" },
);
if (up.error) throw up.error;

console.log("USER_ID=" + userId);
console.log("EMAIL=" + EMAIL);
console.log("PASSWORD=" + PASSWORD);
console.log("rol=porteria OK");
