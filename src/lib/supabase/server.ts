import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from './database.types';

// Cliente de servidor con el JWT del usuario autenticado (coordinador/portería/RRHH),
// leído de las cookies de sesión. RLS aplica según su rol.
// `cookies()` es async en Next 16.
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database, 'permisos'>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'permisos' },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll llamado desde un Server Component: ignorable si el middleware
            // refresca la sesión. (No se pueden escribir cookies durante el render.)
          }
        },
      },
    }
  );
}
