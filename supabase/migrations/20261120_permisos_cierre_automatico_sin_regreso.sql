-- Migración: permisos_cierre_automatico_sin_regreso
-- Aplicada al proyecto REYMON (bosylehvmtwtqkrlievy) el 2026-11-20 vía Supabase MCP apply_migration.
-- REGISTRO ÚNICAMENTE. No usar `supabase db push` ni `db reset` (proyecto compartido).
--
-- Cierre automático de permisos sin regreso (rol portería):
-- quien salió (en_curso) y no volvió queda cerrado con marca "sin regreso".
-- Corre todos los días a las 22:00 Bogotá = 03:00 UTC (Colombia es UTC-5 constante,
-- sin horario de verano; cron.timezone del proyecto = GMT).

create or replace function permisos.cerrar_en_curso_sin_regreso()
returns integer
language plpgsql security definer set search_path = permisos, pg_temp as $$
declare
  n integer;
begin
  update permisos.solicitudes
     set estado = 'cerrado', sin_regreso = true
   where estado = 'en_curso';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function permisos.cerrar_en_curso_sin_regreso() from public;

-- Reemplaza cualquier agendamiento previo del mismo nombre y reprograma a las 22:00 Bogotá.
select cron.unschedule('cerrar-permisos-sin-regreso')
where exists (select 1 from cron.job where jobname = 'cerrar-permisos-sin-regreso');

select cron.schedule(
  'cerrar-permisos-sin-regreso',
  '0 3 * * *',
  $cmd$select permisos.cerrar_en_curso_sin_regreso()$cmd$
);
