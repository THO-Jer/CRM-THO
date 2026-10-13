-- =====================================================================
-- seguridad-2026-10-fase1.sql — Cierre de exposiciones detectadas por
-- el Security Advisor de Supabase (diagnóstico 12-oct-2026)
-- =====================================================================
-- QUÉ ARREGLA (todo esto hoy es accesible con la anon key, que es pública
-- porque va dentro del bundle de crm-tho.vercel.app):
--   1. Policies viejas "permitir todo" que quedaron vivas junto a las de
--      socios (en Postgres las policies se SUMAN con OR: basta una abierta).
--   2. Tablas sin RLS: leads, sii_tokens*, blog_posts, onboarding_*, etc.
--   3. 15 vistas SECURITY DEFINER (crm_export, crm_exec_summary...) que
--      saltan RLS y que anon puede leer.
--   4. Bucket crm-archivos público con policy ALL para cualquiera.
--   5. crm_log_event() (SECURITY DEFINER) ejecutable por anon.
--
-- POR QUÉ NO ROMPE NADA (verificado contra el código, 12-oct-2026):
--   - CRM (crm-tho.vercel.app): entra con Microsoft y usa las policies
--     *_all_socios / es_socio_tho(), que NO se tocan. No usa las vistas.
--     Storage crm-archivos usa list/upload/download/remove con sesión
--     (no URLs públicas) y hoy el bucket está vacío.
--   - /api/public/leads y el cron contable usan service_role → bypassa RLS.
--   - tho-web (sitio, Studio, blog, onboarding, clima, deseos): todo el
--     acceso a datos es server-side con SUPABASE_SERVICE_ROLE_KEY. La anon
--     key en el navegador solo se usa para login (auth), no para tablas.
--   - tho-asistencia usa OTRO proyecto Supabase (fxqgff...), no le afecta.
--   - api-sii (repo de feb-2026) usaba anon key: ya estaba roto desde mayo
--     (boletas_honorarios quedó solo-socios) y sii_tokens* están vacías.
--   - crm_log_event() es función de TRIGGER: los triggers no revisan el
--     permiso EXECUTE al dispararse, así que el historial sigue funcionando.
--
-- CORRER EN: Supabase → SQL Editor → pegar todo → Run. Es una transacción:
-- si algo falla, no se aplica nada.
-- ROLLBACK: seguridad-2026-10-fase1-rollback.sql (reabre la exposición;
-- usar solo si algo se rompe y mientras se corrige).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Borrar policies "permitir todo" que sobrevivieron a cerrar-policies.sql
--    (tenían nombres distintos a los que ese script borraba)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "contactos_all"                      ON public.contactos;
DROP POLICY IF EXISTS "notas_all"                          ON public.notas;
DROP POLICY IF EXISTS "Allow all for authenticated users"  ON public.movimientos_bancarios;
DROP POLICY IF EXISTS "Allow all for authenticated users"  ON public.sueldos_socios;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.caja_chica;

-- key_account_renewals: 4 policies USING(true) para cualquier usuario
-- logueado (hay usuarios Google externos en auth.users). Pasa a solo socios.
DROP POLICY IF EXISTS "auth can read key_account_renewals"   ON public.key_account_renewals;
DROP POLICY IF EXISTS "auth can write key_account_renewals"  ON public.key_account_renewals;
DROP POLICY IF EXISTS "auth can update key_account_renewals" ON public.key_account_renewals;
DROP POLICY IF EXISTS "auth can delete key_account_renewals" ON public.key_account_renewals;
DROP POLICY IF EXISTS "key_account_renewals_all_socios"      ON public.key_account_renewals;
CREATE POLICY "key_account_renewals_all_socios" ON public.key_account_renewals
  FOR ALL TO authenticated
  USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

-- ---------------------------------------------------------------------
-- 2. Activar RLS en tablas que no lo tenían
--    Sin policy = solo service_role (server-side) puede leer/escribir.
-- ---------------------------------------------------------------------
-- 2a. Usadas solo server-side (tho-web, endpoints) → RLS sin policy
ALTER TABLE public.leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_tokens                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_tokens_boletas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_module_status  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_quiz_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_quiz_results   ENABLE ROW LEVEL SECURITY;

-- 2b. Tablas contables del CRM → RLS + mismo patrón de socios
ALTER TABLE public.configuracion_contable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracion_contable_all_socios" ON public.configuracion_contable;
CREATE POLICY "configuracion_contable_all_socios" ON public.configuracion_contable
  FOR ALL TO authenticated USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_batches_all_socios" ON public.import_batches;
CREATE POLICY "import_batches_all_socios" ON public.import_batches
  FOR ALL TO authenticated USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

ALTER TABLE public.sii_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sii_sync_log_all_socios" ON public.sii_sync_log;
CREATE POLICY "sii_sync_log_all_socios" ON public.sii_sync_log
  FOR ALL TO authenticated USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

-- ---------------------------------------------------------------------
-- 3. Vistas: que respeten el RLS de quien consulta (security_invoker)
--    y quitar lectura a anon. service_role (tho-web) sigue viendo todo.
-- ---------------------------------------------------------------------
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
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. Storage: crm-archivos privado y solo para socios
--    (blog-assets se queda público: son las imágenes del blog)
-- ---------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'crm-archivos';
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "crm_archivos_socios" ON storage.objects;
CREATE POLICY "crm_archivos_socios" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'crm-archivos' AND public.es_socio_tho())
  WITH CHECK (bucket_id = 'crm-archivos' AND public.es_socio_tho());

-- ---------------------------------------------------------------------
-- 5. crm_log_event() (trigger, SECURITY DEFINER): nadie necesita llamarla
--    por la API. Los triggers siguen disparándose igual.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.crm_log_event() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Deseos y clima: escribir solo vía tho-web (server-side, service_role).
--    /api/deseos y /api/clima/respuesta ya usan service_role; estas policies
--    permitían insertar directo con la anon key, saltándose validaciones
--    (largo del deseo; sesión de Studio y ronda activa en clima).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "insertar_anonimo"   ON public.capsula_tiempo;
DROP POLICY IF EXISTS "insertar_respuesta" ON public.clima_respuesta;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (correr después, por separado). Todo debería salir vacío
-- o en false salvo lo indicado.
-- =====================================================================
-- select jsonb_pretty(jsonb_build_object(
--  'tablas_sin_rls', (select jsonb_agg(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--                     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),          -- esperado: null
--  'policies_true',  (select jsonb_agg(tablename||'.'||policyname) from pg_policies
--                     where schemaname='public' and (qual='true' or with_check='true')
--                       and cmd <> 'INSERT'),                                                         -- esperado: null
--  'vistas_definer', (select jsonb_agg(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--                     where n.nspname='public' and c.relkind='v'
--                       and not coalesce(c.reloptions::text like '%security_invoker=true%', false)),  -- esperado: null
--  'bucket_publico', (select public from storage.buckets where id='crm-archivos'),                    -- esperado: false
--  'crm_members',    (select jsonb_agg(email) from public.crm_members)                                -- esperado: los 3 socios
-- ));
-- Luego: entrar al CRM con Microsoft y revisar que carguen pipeline,
-- contabilidad, notas y archivos. Y en Security Advisor → "Rerun linter".
