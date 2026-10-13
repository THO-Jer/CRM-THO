-- =====================================================================
-- ROLLBACK de seguridad-2026-10-fase1.sql
-- ATENCIÓN: esto REABRE la exposición. Usar solo si algo se rompió y
-- mientras se arregla puntualmente. Recrea el estado exacto del 12-oct-2026.
-- =====================================================================
BEGIN;

CREATE POLICY "contactos_all" ON public.contactos FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "notas_all" ON public.notas FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON public.movimientos_bancarios FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON public.sueldos_socios FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.caja_chica FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "key_account_renewals_all_socios" ON public.key_account_renewals;
CREATE POLICY "auth can read key_account_renewals"   ON public.key_account_renewals FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can write key_account_renewals"  ON public.key_account_renewals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update key_account_renewals" ON public.key_account_renewals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth can delete key_account_renewals" ON public.key_account_renewals FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "configuracion_contable_all_socios" ON public.configuracion_contable;
DROP POLICY IF EXISTS "import_batches_all_socios" ON public.import_batches;
DROP POLICY IF EXISTS "sii_sync_log_all_socios" ON public.sii_sync_log;
ALTER TABLE public.leads                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_tokens                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_tokens_boletas        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_module_status  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_quiz_attempts  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_quiz_results   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_contable    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_sync_log              DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'crm_key_accounts_ending_30d','crm_mrr_by_health','crm_renewals_log',
    'crm_churn_monthly','crm_mrr_movements_monthly','crm_exec_summary',
    'crm_contracts_ending_60d','crm_tickets_risk','crm_export',
    'crm_execution_load','crm_entity_history','crm_prospect_conversions',
    'crm_prospect_time_to_convert','onboarding_admin_overview','sii_sync_resumen'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I RESET (security_invoker)', v);
      EXECUTE format('GRANT ALL ON public.%I TO anon', v);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "crm_archivos_socios" ON storage.objects;
UPDATE storage.buckets SET public = true WHERE id = 'crm-archivos';
CREATE POLICY "Public Access" ON storage.objects FOR ALL TO public USING (bucket_id = 'crm-archivos');

GRANT EXECUTE ON FUNCTION public.crm_log_event() TO PUBLIC, anon, authenticated;

CREATE POLICY "insertar_anonimo" ON public.capsula_tiempo FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "insertar_respuesta" ON public.clima_respuesta FOR INSERT TO public WITH CHECK (true);

COMMIT;
