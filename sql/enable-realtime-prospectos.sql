-- Habilita Supabase Realtime para la tabla prospectos.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
--
-- Con esto, el CRM recibe eventos en vivo cuando:
--  - entra un lead desde tho.cl (INSERT vía /api/public/leads)
--  - otro socio crea/edita/elimina un prospecto
--
-- Idempotente: si la tabla ya está en la publicación, no hace nada.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'prospectos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.prospectos;
    END IF;
END $$;

-- Verificación (debe devolver 1 fila):
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'prospectos';
