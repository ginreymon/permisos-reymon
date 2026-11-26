'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

// Cliente para el navegador (rol anon + JWT del usuario si hay sesión Auth).
// Solo lo usan las vistas con Supabase Auth: coordinador, portería, RRHH.
// El colaborador NO usa este cliente (pasa por server actions con service role).
// Esquema por defecto: `permisos` (requiere Bloque B / exposed schema para funcionar).
export function crearClienteNavegador() {
  return createBrowserClient<Database, 'permisos'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'permisos' } }
  );
}
