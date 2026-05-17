-- =====================================================================
-- cerrar-policies.sql — Cerrar las RLS abiertas del CRM-THO
-- =====================================================================
-- Reemplaza las policies USING(true) y USING(auth.uid() = user_id) por
-- una whitelist de emails compartida entre los tres socios.
--
-- Antes:
--   - `contactos` y `notas` estaban en USING(true) → cualquiera con la
--     anon key podía leer/escribir.
--   - `prospectos` estaba en USING(auth.uid() = user_id) → cada socio
--     solo veía sus propios prospectos. Los leads que entraban desde
--     tho.cl se asignaban a un solo user_id (LEADS_OWNER_USER_ID), así
--     que solo ese socio los veía.
--
-- Después:
--   - Las tres cuentas de socio (autenticadas vía Microsoft OAuth) ven
--     y editan todo. Cualquier otro usuario (incluso autenticado en
--     Supabase) no ve nada.
--   - Los inserts del endpoint /api/public/leads.js siguen funcionando
--     porque usan service_role_key, que bypassa RLS por diseño.
--
-- CORRER EN: Supabase Dashboard → SQL Editor → New query → pegar y Run.
--
-- REQUISITO ANTES DE CORRER: haber probado el OAuth de Microsoft al
-- menos una vez con jeremias@tho.cl, para que exista un user en auth.users
-- con ese email. Si no, te quedas afuera del CRM hasta que entre alguien.
--
-- ROLLBACK: si algo sale mal, correr cerrar-policies-rollback.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Función helper — whitelist de socios autorizados
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_socio_tho()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT auth.email() IN (
    'jeremias@tho.cl',
    'max@tho.cl',
    'francisco@tho.cl'
  );
$$;

COMMENT ON FUNCTION public.es_socio_tho IS
  'Retorna true si el usuario autenticado actual está en la whitelist de socios THO. Usado por las policies RLS del CRM. Para agregar/quitar socios, editar el SELECT y re-correr.';


-- ---------------------------------------------------------------------
-- 2. Aplicar la nueva policy a cada tabla
--    Patrón: DROP de policies viejas, ALTER ENABLE RLS, CREATE de
--    una sola policy FOR ALL que usa la función helper.
-- ---------------------------------------------------------------------

-- ===== prospectos =====
ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prospectos_select_own"    ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_insert_own"    ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_update_own"    ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_delete_own"    ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_all_socios"    ON public.prospectos;
CREATE POLICY "prospectos_all_socios" ON public.prospectos
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== cerrados =====
ALTER TABLE public.cerrados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cerrados_all_socios" ON public.cerrados;
CREATE POLICY "cerrados_all_socios" ON public.cerrados
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== tickets =====
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_all_socios" ON public.tickets;
CREATE POLICY "tickets_all_socios" ON public.tickets
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== key_accounts =====
ALTER TABLE public.key_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "key_accounts_all_socios" ON public.key_accounts;
CREATE POLICY "key_accounts_all_socios" ON public.key_accounts
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== contactos =====
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contactos_select_authenticated" ON public.contactos;
DROP POLICY IF EXISTS "contactos_insert_authenticated" ON public.contactos;
DROP POLICY IF EXISTS "contactos_update_authenticated" ON public.contactos;
DROP POLICY IF EXISTS "contactos_delete_authenticated" ON public.contactos;
DROP POLICY IF EXISTS "contactos_all_authenticated"    ON public.contactos;
DROP POLICY IF EXISTS "contactos_all_socios"           ON public.contactos;
CREATE POLICY "contactos_all_socios" ON public.contactos
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== notas =====
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notas_select_authenticated" ON public.notas;
DROP POLICY IF EXISTS "notas_insert_authenticated" ON public.notas;
DROP POLICY IF EXISTS "notas_update_authenticated" ON public.notas;
DROP POLICY IF EXISTS "notas_delete_authenticated" ON public.notas;
DROP POLICY IF EXISTS "notas_all_authenticated"    ON public.notas;
DROP POLICY IF EXISTS "notas_all_socios"           ON public.notas;
CREATE POLICY "notas_all_socios" ON public.notas
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== facturas_emitidas =====
ALTER TABLE public.facturas_emitidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "facturas_emitidas_all_socios" ON public.facturas_emitidas;
CREATE POLICY "facturas_emitidas_all_socios" ON public.facturas_emitidas
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== facturas_recibidas =====
ALTER TABLE public.facturas_recibidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "facturas_recibidas_all_socios" ON public.facturas_recibidas;
CREATE POLICY "facturas_recibidas_all_socios" ON public.facturas_recibidas
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== boletas_honorarios =====
ALTER TABLE public.boletas_honorarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boletas_honorarios_all_socios" ON public.boletas_honorarios;
CREATE POLICY "boletas_honorarios_all_socios" ON public.boletas_honorarios
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== sueldos_socios =====
ALTER TABLE public.sueldos_socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sueldos_socios_all_socios" ON public.sueldos_socios;
CREATE POLICY "sueldos_socios_all_socios" ON public.sueldos_socios
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== caja_chica =====
ALTER TABLE public.caja_chica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "caja_chica_all_socios" ON public.caja_chica;
CREATE POLICY "caja_chica_all_socios" ON public.caja_chica
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== movimientos_bancarios =====
ALTER TABLE public.movimientos_bancarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movimientos_bancarios_all_socios" ON public.movimientos_bancarios;
CREATE POLICY "movimientos_bancarios_all_socios" ON public.movimientos_bancarios
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== crm_events (tabla de auditoría/historial) =====
-- Comentamos las siguientes 5 secciones porque dependen de que existan
-- las tablas. Si no existen en tu Supabase, Postgres tira error.
-- Si te tira "relation does not exist" comentá la sección y seguí.

ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_events_all_socios" ON public.crm_events;
CREATE POLICY "crm_events_all_socios" ON public.crm_events
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== crm_transitions =====
ALTER TABLE public.crm_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_transitions_all_socios" ON public.crm_transitions;
CREATE POLICY "crm_transitions_all_socios" ON public.crm_transitions
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== crm_renewals =====
ALTER TABLE public.crm_renewals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_renewals_all_socios" ON public.crm_renewals;
CREATE POLICY "crm_renewals_all_socios" ON public.crm_renewals
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());

-- ===== crm_entity_links =====
ALTER TABLE public.crm_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_entity_links_all_socios" ON public.crm_entity_links;
CREATE POLICY "crm_entity_links_all_socios" ON public.crm_entity_links
  FOR ALL TO authenticated
  USING (public.es_socio_tho())
  WITH CHECK (public.es_socio_tho());


-- =====================================================================
-- 3. Verificación post-aplicación
-- =====================================================================
-- Después de correr todo lo de arriba, ejecutá ESTAS queries por separado:
--
-- (a) Listar todas las policies activas — debería haber UNA "_all_socios"
--     por cada tabla, sin policies viejas tipo "_select_own" o "_authenticated":
--
--     SELECT tablename, policyname, qual
--     FROM pg_policies
--     WHERE schemaname = 'public'
--     ORDER BY tablename, policyname;
--
-- (b) Test rápido — corriendo esto desde SQL Editor como usuario logeado
--     con uno de los emails de la whitelist, debería retornar TRUE:
--
--     SELECT public.es_socio_tho(), auth.email();
--
-- (c) Si auth.email() sale NULL: significa que estás corriendo el SQL
--     Editor como service_role (que no tiene auth.email()). Eso es OK
--     para correr la migración pero no sirve para testear la policy.
--     Para testear de verdad, entrá al CRM con tu cuenta Microsoft y
--     mirá si carga el dashboard.
-- =====================================================================
