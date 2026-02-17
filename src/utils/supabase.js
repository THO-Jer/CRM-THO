import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bepifbenblkqjuplvylh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGlmYmVuYmxrcWp1cGx2eWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEzMDQsImV4cCI6MjA4NTE4NzMwNH0.E0gnHaRFm1V3PuN6aAvspmeuByzrqScbItE-ihh9kY0'

export const supabase = createClient(supabaseUrl, supabaseKey)
