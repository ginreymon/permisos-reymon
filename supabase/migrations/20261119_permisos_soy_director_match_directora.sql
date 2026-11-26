-- Migración: permisos_soy_director_match_directora
-- Aplicada a REYMON (bosylehvmtwtqkrlievy) el 2026-11-19 vía Supabase MCP. REGISTRO.
-- El cargo real en siesa es "DIRECTORA GENERAL"; el patrón '%director general%' no la
-- matchea (directorA rompe el substring). Se afloja a '%director%general%'.

create or replace function permisos.soy_director()
returns boolean
language sql stable security definer set search_path = permisos, pg_temp as $$
  select exists (
    select 1 from permisos.usuarios
    where user_id = auth.uid() and activo
      and rol = 'coordinador'
      and lower(nombre_cargo) like '%director%general%'
  );
$$;
