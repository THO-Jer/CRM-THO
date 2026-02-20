-- ============================================
-- CRM THO - Captación de leads web
-- Ejecutar en Supabase SQL Editor
-- ============================================

ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_email TEXT;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_page_url TEXT;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_utm JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_service_interest TEXT DEFAULT 'no_definido';
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_entry_type TEXT DEFAULT 'general';
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_consent BOOLEAN DEFAULT false;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS lead_consent_at TIMESTAMPTZ;
ALTER TABLE public.prospectos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Dedupe por email normalizado
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospectos_lead_email_unique
ON public.prospectos (lower(lead_email))
WHERE lead_email IS NOT NULL;

-- Índices de atribución
CREATE INDEX IF NOT EXISTS idx_prospectos_lead_source ON public.prospectos(lead_source);
CREATE INDEX IF NOT EXISTS idx_prospectos_lead_service_interest ON public.prospectos(lead_service_interest);
CREATE INDEX IF NOT EXISTS idx_prospectos_lead_entry_type ON public.prospectos(lead_entry_type);
