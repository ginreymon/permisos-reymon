-- Migración: permisos_coordinador_crea_soporte_director
-- Aplicada al proyecto REYMON (bosylehvmtwtqkrlievy) el 2026-11-19 vía Supabase MCP apply_migration.
-- REGISTRO ÚNICAMENTE. No usar `supabase db push` ni `db reset` (proyecto compartido).
--
-- Cambios del rol coordinador:
--  1) Crear permiso por cédula (urgente, ya aprobado) para su propia área.
--  2) Subir soporte faltante de permisos resueltos sin límite de tiempo.
--  3) Enrutar los permisos de cargos coordinador/jefe a la Dirección General (Emylce),
--     fuera de la bandeja de los coordinadores pares.
--
-- Nota: la detección de cargo directivo se hace en la app con empleados_act.cargo
-- (contiene "coordinador" o "jefe"). Mientras el campo venga vacío, para_director=false
-- y el permiso sigue la ruta normal. La cuenta de la Dirección General (nombre_cargo
-- 'Director General') se creará luego desde el módulo RRHH; las policies ya la soportan.

-- 1. Flag de enrutamiento a Dirección General
alter table permisos.solicitudes
  add column if not exists para_director boolean not null default false;

create index if not exists sol_para_director
  on permisos.solicitudes (estado) where para_director;

-- 2. empleado_por_documento ahora devuelve también el cargo. Mantiene el blindaje
--    (solo service_role o rrhh obtienen filas) y los casts a text (columnas varchar).
drop function if exists permisos.empleado_por_documento(text);
create function permisos.empleado_por_documento(p_doc text)
returns table (documento text, nombre text, centro_costo text, cargo text)
language plpgsql stable security definer set search_path = permisos, siesa_raw, pg_temp as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and permisos.mi_rol() is distinct from 'rrhh' then
    return;
  end if;
  return query
    select e.documento::text, e.nombre::text, e.centro_costo::text, e.cargo::text
    from siesa_raw.empleados_act e
    where e.documento::text = p_doc and coalesce(e."Eliminado", false) = false;
end $$;
grant execute on function permisos.empleado_por_documento(text) to authenticated, service_role;

-- 3. ¿El usuario autenticado es la Dirección General? (rol coordinador + nombre_cargo)
create or replace function permisos.soy_director()
returns boolean
language sql stable security definer set search_path = permisos, pg_temp as $$
  select exists (
    select 1 from permisos.usuarios
    where user_id = auth.uid() and activo
      and rol = 'coordinador'
      and lower(nombre_cargo) like '%director general%'
  );
$$;
grant execute on function permisos.soy_director() to authenticated, service_role;

-- 4. Enrutamiento. Los permisos marcados salen de la bandeja de los coordinadores
--    normales y entran solo en la de la Dirección General.
drop policy sol_coord_read on permisos.solicitudes;
create policy sol_coord_read on permisos.solicitudes
  for select to authenticated
  using (permisos.mi_rol()='coordinador'
         and centro_costo in (select permisos.mis_centros())
         and not para_director);

drop policy sol_coord_decide on permisos.solicitudes;
create policy sol_coord_decide on permisos.solicitudes
  for update to authenticated
  using (permisos.mi_rol()='coordinador' and estado='pendiente'
         and centro_costo in (select permisos.mis_centros())
         and not para_director)
  with check (centro_costo in (select permisos.mis_centros()));

create policy sol_director_read on permisos.solicitudes
  for select to authenticated
  using (permisos.soy_director() and para_director);

create policy sol_director_decide on permisos.solicitudes
  for update to authenticated
  using (permisos.soy_director() and para_director and estado='pendiente')
  with check (para_director);
