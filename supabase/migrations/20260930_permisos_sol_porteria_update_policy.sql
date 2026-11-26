-- Migración: permisos_sol_porteria_update_policy
-- Aplicada a REYMON (bosylehvmtwtqkrlievy) el 2026-09-30 vía Supabase MCP. REGISTRO.
-- Portería registra salida/regreso real y puede deshacer:
--   aprobado -> en_curso (salida), en_curso -> cerrado (regreso), y la reversa.
-- Antes solo existía policy UPDATE para coordinador (sol_coord_decide), así que
-- el rol porteria no podía escribir el estado ni las horas reales.

create policy sol_porteria_marca on permisos.solicitudes
  for update to authenticated
  using ( permisos.mi_rol() = 'porteria'::permisos.rol_usuario
          and estado = any (array['aprobado','en_curso','cerrado']::permisos.estado_solic[]) )
  with check ( permisos.mi_rol() = 'porteria'::permisos.rol_usuario
               and estado = any (array['aprobado','en_curso','cerrado']::permisos.estado_solic[]) );
