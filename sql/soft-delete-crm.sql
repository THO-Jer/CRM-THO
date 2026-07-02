-- Soft-delete para las entidades CRM: prospectos, cerrados, tickets, key_accounts.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase ANTES de deployar el código que lo usa.
--
-- "Eliminar" en la app ahora setea deleted_at (con opción Deshacer por unos
-- segundos) en vez de borrar la fila. Las cargas filtran deleted_at IS NULL
-- en el cliente, así que si esta migración no se ha corrido, la app sigue
-- funcionando — solo que el botón eliminar dará error hasta correrla.
--
-- Idempotente: usa IF NOT EXISTS.

ALTER TABLE public.prospectos   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.cerrados     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tickets     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.key_accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Índices parciales: las queries siempre piden "no eliminados"
CREATE INDEX IF NOT EXISTS idx_prospectos_not_deleted   ON public.prospectos (created_at)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cerrados_not_deleted     ON public.cerrados (fecha_cierre)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_not_deleted      ON public.tickets (created_at)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_key_accounts_not_deleted ON public.key_accounts (organizacion) WHERE deleted_at IS NULL;

-- Para vaciar la "papelera" manualmente más adelante (opcional):
-- DELETE FROM public.prospectos WHERE deleted_at < now() - interval '90 days';
