import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('[supabase] Faltan variables de entorno: define VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY o SUPABASE_URL/SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
