// Crea (o reutiliza) un usuario coordinador de prueba en Supabase Auth.
// Uso: node scripts/seed-coordinador.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL = "coordinador.gerencia@reymon.test";
const PASSWORD = "Reymon2026*";

let userId;
const creado = await admin.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
if (creado.error) {
  if (!creado.error.message.toLowerCase().includes("already")) throw creado.error;
  // Ya existe: buscarlo.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = data.users.find((u) => u.email === EMAIL)?.id;
} else {
  userId = creado.data.user.id;
}

console.log("USER_ID=" + userId);
console.log("EMAIL=" + EMAIL);
console.log("PASSWORD=" + PASSWORD);
