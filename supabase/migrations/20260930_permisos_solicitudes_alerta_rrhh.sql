-- Migración: permisos_solicitudes_alerta_rrhh
-- Aplicada a REYMON (bosylehvmtwtqkrlievy) el 2026-09-30 vía Supabase MCP. REGISTRO.
-- Marca de revisión para Talento Humano cuando el coordinador rechaza con
-- "No reconozco esta solicitud". Como el colaborador entra solo con cédula +
-- primer apellido, ese motivo puede indicar que alguien pidió el permiso a
-- nombre de otro; RRHH debe poder filtrar estos casos.

alter table permisos.solicitudes
  add column if not exists alerta_rrhh boolean not null default false;

comment on column permisos.solicitudes.alerta_rrhh is
  'true cuando el coordinador rechaza con "No reconozco esta solicitud": el colaborador entra solo con cédula+apellido, así que RRHH debe revisar quién la hizo.';
