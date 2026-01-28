import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://bepifbenblkqjuplvylh.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_hBu6rHS2Uou1fy31MPkCdA_7ZIS6S6V'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
