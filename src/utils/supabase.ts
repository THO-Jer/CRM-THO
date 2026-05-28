import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Las credenciales viven exclusivamente en variables de entorno.
// - En Vercel: Project Settings → Environment Variables (Production + Preview).
// - En local: archivo .env (ver .env.example como plantilla).
const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    // Compat con el .env legacy que usaba VITE_SUPABASE_KEY como nombre.
    import.meta.env.VITE_SUPABASE_KEY_URL

const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    // Falla fuerte: si las env vars faltan, la app no debe arrancar con datos
    // potencialmente equivocados. Antes había un fallback hardcodeado; lo sacamos
    // tras confirmar que Vercel tiene las vars configuradas (mayo 2026).
    throw new Error(
        '[supabase] Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
        'Configurar en Vercel → Settings → Environment Variables, o en .env local.'
    )
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)
