import { createClient } from '@supabase/supabase-js'

// Lee de Vite env vars (que en Vercel se setean en Settings → Environment Variables).
// VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son los nombres convencionales.
// Aceptamos VITE_SUPABASE_KEY como alias por compatibilidad con el .env legacy.
const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    'https://bepifbenblkqjuplvylh.supabase.co'

const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_KEY ||
    // Fallback temporal mientras Vercel se reconfigura. La anon key de Supabase
    // está pensada para vivir en el cliente; el control real de acceso son las
    // RLS policies. Aún así, lo correcto es no hardcodearla acá.
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGlmYmVuYmxrcWp1cGx2eWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEzMDQsImV4cCI6MjA4NTE4NzMwNH0.E0gnHaRFm1V3PuN6aAvspmeuByzrqScbItE-ihh9kY0'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    // Aviso visible en consola para no olvidar configurarlo en Vercel.
    // No bloquea la app — el fallback hardcoded sigue funcionando hasta que se complete la migración.
    console.warn('[supabase] Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en el entorno. Usando fallback. Configura las env vars en Vercel.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
