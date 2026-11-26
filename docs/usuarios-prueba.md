# Usuarios de prueba

Credenciales para probar cada rol en el entorno de **test** (proyecto Supabase `REYMON` / `bosylehvmtwtqkrlievy`).

> ⚠️ Solo test. La clave `Reymon2026*` es débil: cambiarla antes de producción.

## Roles con Supabase Auth (correo + contraseña)

Pantallas: `/coordinador`, `/porteria`, `/rrhh`.

| Rol | Correo | Contraseña |
|-----|--------|-----------|
| Coordinador | `coordinador.gerencia@reymon.test` | `Reymon2026*` |
| Portería | `porteria.principal@reymon.test` | `Reymon2026*` |
| RRHH / Talento Humano | `rrhh.talento@reymon.test` | `Reymon2026*` |

El rol se valida contra `permisos.usuarios` vía la función `mi_rol()`; si la cuenta no coincide con la pantalla, la sesión se cierra.

### Porteros individuales (cuentas reales por persona)

Cada portero tiene su propia cuenta para que el histórico registre quién marcó la salida/regreso (`registrado_por`). Vinculadas a su cédula vía `permisos.usuarios.documento`, por lo que en **Solicitud** generan su propio permiso sin teclear cédula (lo aprueba la Dirección General).

| Correo | Nombre (Siesa) | Cédula | Contraseña |
|--------|----------------|--------|-----------|
| `portero1@reymon.com.co` | `ROJAS VARGAS HADALBER` | `7700950` | `Reymon2027$1` |
| `portero2@reymon.com.co` | `MERCHAN TOVAR ERIKA ALEJANDRA` | `1109845622` | `Reymon2027$2` |

Las cuentas se crean/reutilizan con los scripts:
- `scripts/seed-coordinador.mjs`
- `scripts/seed-porteria.mjs`
- `scripts/seed-rrhh.mjs`

Todos usan `Reymon2026*` (ya sincronizados con la clave viva).

## Colaborador (sin cuenta — login por cédula)

No usa Supabase Auth: sesión propia por cookie cifrada (30 min). Entra en `/` con **cédula + primer apellido** de un empleado real de Siesa (`siesa_raw.empleados_act`) + aceptar habeas data.

Ejemplo válido:

| Campo | Valor |
|-------|-------|
| Cédula | `52305636` |
| Primer apellido | `GUZMAN` |

(El nombre en Siesa va con apellidos primero: `GUZMAN MOSQUERA MONICA YENNY`.)

Rate limit: 5 intentos fallidos por cédula o IP en 15 min.

## Director General / Dirección General (Emylce)

Pendiente: aún **sin cuenta**. Los permisos de cargos directivos (coordinador/jefe) se enrutan a Dirección General, pero la cuenta de Emylce falta por crear vía el módulo RRHH.
