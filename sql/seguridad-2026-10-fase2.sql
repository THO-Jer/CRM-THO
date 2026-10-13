-- =====================================================================
-- seguridad-2026-10-fase2.sql — Fija search_path en funciones (oct-2026)
-- =====================================================================
-- Resuelve el aviso "Function Search Path Mutable" del Security Advisor.
-- Sin search_path fijo, una función usa el del usuario que la llama, y
-- alguien podría hacer que resuelva un nombre a un objeto distinto.
--
-- Por qué no cambia el comportamiento (revisado 13-oct-2026): ninguna usa
-- extensiones; todas califican sus tablas con public./auth. salvo
-- ultima_sync_sii (usa sii_sync_log, que vive en public). Las funciones de
-- sistema (now, format, jsonb_*) están en pg_catalog, que siempre se busca.
-- pg_temp al final evita que una tabla temporal "tape" una real.
--
-- Idempotente. ROLLBACK: ALTER FUNCTION ... RESET search_path;
-- =====================================================================
BEGIN;
ALTER FUNCTION public.ultima_sync_sii(text, text)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.log_documento_sii()                                 SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                                    SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_key_account_renewal()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_key_account_from_renewal()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_log_event(text, uuid, text, text, jsonb)        SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_create_renewal(uuid, date, date, numeric, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_cancel_key_account(uuid, text, text)            SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_set_updated_at()                                 SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_log_event()                                     SET search_path = public, pg_temp;
COMMIT;
