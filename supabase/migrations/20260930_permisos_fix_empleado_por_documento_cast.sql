-- Migración: permisos_fix_empleado_por_documento_cast
-- Aplicada a REYMON (bosylehvmtwtqkrlievy) el 2026-09-30 vía Supabase MCP. REGISTRO.
-- Fix: siesa_raw.empleados_act columnas son varchar; la función declaraba text -> 42804
-- "structure of query does not match function result type". Se castea a text.

create or replace function permisos.empleado_por_documento(p_doc text)
returns table (documento text, nombre text, centro_costo text)
language plpgsql stable security definer set search_path = permisos, siesa_raw, pg_temp as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and permisos.mi_rol() is distinct from 'rrhh' then
    return;
  end if;
  return query
    select e.documento::text, e.nombre::text, e.centro_costo::text
    from siesa_raw.empleados_act e
    where e.documento::text = p_doc and coalesce(e."Eliminado", false) = false;
end $$;
