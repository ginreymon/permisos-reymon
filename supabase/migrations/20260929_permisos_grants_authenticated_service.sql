-- Migración: permisos_grants_authenticated_service (Bloque B #1)
-- Aplicada al proyecto REYMON (bosylehvmtwtqkrlievy) el 2026-09-29 vía Supabase MCP. REGISTRO.
-- Privilegios sobre el esquema permisos. RLS sigue filtrando filas.
-- FALTA Bloque B #2 (manual, Dashboard > API > Exposed schemas): AÑADIR 'permisos'
-- a la lista existente SIN borrar los demás esquemas (rompería las otras apps).

-- authenticated (coordinador/portería/rrhh vía su JWT). anon queda SIN nada.
grant usage on schema permisos to authenticated;
grant select on
  permisos.tipos_permiso, permisos.usuarios, permisos.coordinador_centros,
  permisos.solicitudes, permisos.movimientos_porteria, permisos.historial_estados
  to authenticated;
grant insert, update on permisos.solicitudes to authenticated;
grant insert, update on permisos.movimientos_porteria to authenticated;
grant execute on function
  permisos.mi_rol(), permisos.mis_centros(),
  permisos.empleado_por_documento(text), permisos.resumen_sync()
  to authenticated;

-- service_role (server actions del colaborador; bypassa RLS). Acceso total.
grant usage on schema permisos to service_role;
grant all on all tables in schema permisos to service_role;
grant execute on all functions in schema permisos to service_role;
