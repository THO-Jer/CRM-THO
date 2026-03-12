ALTER TABLE IF EXISTS public.boletas_honorarios
ADD COLUMN IF NOT EXISTS estado text;
