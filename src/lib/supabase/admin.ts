import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Cliente con service role. SOLO en server actions y route handlers.
// Bypassa RLS: filtrar SIEMPRE por el `documento` de la sesión del colaborador.
// Nunca importar desde componentes de cliente (el `server-only` lo impide en build).
export function crearClienteAdmin() {
  return createClient<Database, 'permisos'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: 'permisos' },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
