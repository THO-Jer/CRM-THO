ALTER TABLE public.facturas_recibidas
ALTER COLUMN categoria DROP NOT NULL;

ALTER TABLE public.facturas_recibidas
ALTER COLUMN categoria SET DEFAULT 'Sin categorizar';

UPDATE public.facturas_recibidas
SET categoria = 'Sin categorizar'
WHERE categoria IS NULL;
