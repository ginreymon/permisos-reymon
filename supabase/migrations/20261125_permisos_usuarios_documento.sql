-- Migración: permisos_usuarios_documento
-- Aplicada al proyecto REYMON (bosylehvmtwtqkrlievy) el 2026-11-25 vía Supabase MCP apply_migration.
-- REGISTRO ÚNICAMENTE. No usar `supabase db push` ni `db reset` (proyecto compartido).
--
-- Vincula una cuenta (auth) con su cédula de empleado. Portería lo usa para generar
-- su propio permiso sin teclear la cédula: la cuenta ya identifica a la persona.

alter table permisos.usuarios
  add column if not exists documento text;

-- Cuentas de portería individuales (creadas antes vía SQL): se les asigna su cédula.
update permisos.usuarios u
   set documento = '7700950'
  from auth.users a
 where a.id = u.user_id and a.email = 'portero1@reymon.com.co';   -- ROJAS VARGAS HADALBER

update permisos.usuarios u
   set documento = '1109845622'
  from auth.users a
 where a.id = u.user_id and a.email = 'portero2@reymon.com.co';   -- MERCHAN TOVAR ERIKA ALEJANDRA
