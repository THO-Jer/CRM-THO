ALTER TABLE public.facturas_recibidas
ALTER COLUMN categoria DROP NOT NULL;

ALTER TABLE public.facturas_recibidas
ALTER COLUMN categoria SET DEFAULT 'Otros';

UPDATE public.facturas_recibidas
SET categoria = 'Otros'
WHERE categoria IS NULL;
