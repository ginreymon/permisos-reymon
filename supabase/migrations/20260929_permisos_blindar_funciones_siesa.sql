-- Migración: permisos_blindar_funciones_siesa
-- Aplicada al proyecto REYMON (bosylehvmtwtqkrlievy) el 2026-09-29 vía Supabase MCP. REGISTRO.
-- Blindaje: solo service_role (server) o rol rrhh leen siesa_raw vía estas funciones.
-- Otros 'authenticated' (incl. usuarios de otras apps del proyecto compartido) reciben vacío
-- -> protege habeas data (Ley 1581). Conexión directa/admin (auth.role() null) no se bloquea.

create or replace function permisos.empleado_por_documento(p_doc text)
returns table (documento text, nombre text, centro_costo text)
language plpgsql stable security definer set search_path = permisos, siesa_raw, pg_temp as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and permisos.mi_rol() is distinct from 'rrhh' then
    return;
  end if;
  return query
    select e.documento, e.nombre, e.centro_costo
    from siesa_raw.empleados_act e
    where e.documento = p_doc and coalesce(e."Eliminado", false) = false;
end $$;

create or replace function permisos.resumen_sync()
returns table (ultima_sync timestamptz, empleados_activos int)
language plpgsql stable security definer set search_path = permisos, siesa_raw, pg_temp as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and permisos.mi_rol() is distinct from 'rrhh' then
    return;
  end if;
  return query
    select
      (select max(completed_at) from siesa_raw.sync_batches where status = 'success'),
      (select count(*)::int from siesa_raw.empleados_act where coalesce("Eliminado", false) = false);
end $$;
