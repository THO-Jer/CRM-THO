-- =====================================================================
-- cerrar-policies-rollback.sql — Revertir la migración de cerrar-policies.sql
-- =====================================================================
-- Restaura el estado anterior: prospectos en USING(auth.uid() = user_id),
-- contactos/notas en USING(true). El resto de las tablas se quedan con
-- RLS activo pero SIN policies — equivale a que nadie tenga acceso,
-- lo cual es deliberado (te obliga a re-aplicar la migración o pensar
-- bien qué quieres).
--
-- USAR SOLO SI: aplicaste cerrar-policies.sql y algo salió mal y necesitas
-- volver al estado previo de emergencia.
-- =====================================================================

-- ===== prospectos — restaurar el patrón "own" =====
DROP POLICY IF EXISTS "prospectos_all_socios" ON public.prospectos;

CREATE POLICY "prospectos_select_own" ON public.prospectos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "prospectos_insert_own" ON public.prospectos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prospectos_update_own" ON public.prospectos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prospectos_delete_own" ON public.prospectos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ===== contactos — restaurar policies abiertas =====
DROP POLICY IF EXISTS "contactos_all_socios" ON public.contactos;
CREATE POLICY "contactos_all_authenticated" ON public.contactos
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== notas — restaurar policies abiertas =====
DROP POLICY IF EXISTS "notas_all_socios" ON public.notas;
CREATE POLICY "notas_all_authenticated" ON public.notas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ===== resto de las tablas — dropear policies (queda RLS sin policies) =====
DROP POLICY IF EXISTS "cerrados_all_socios"             ON public.cerrados;
DROP POLICY IF EXISTS "tickets_all_socios"              ON public.tickets;
DROP POLICY IF EXISTS "key_accounts_all_socios"         ON public.key_accounts;
DROP POLICY IF EXISTS "facturas_emitidas_all_socios"    ON public.facturas_emitidas;
DROP POLICY IF EXISTS "facturas_recibidas_all_socios"   ON public.facturas_recibidas;
DROP POLICY IF EXISTS "boletas_honorarios_all_socios"   ON public.boletas_honorarios;
DROP POLICY IF EXISTS "sueldos_socios_all_socios"       ON public.sueldos_socios;
DROP POLICY IF EXISTS "caja_chica_all_socios"           ON public.caja_chica;
DROP POLICY IF EXISTS "movimientos_bancarios_all_socios" ON public.movimientos_bancarios;
DROP POLICY IF EXISTS "crm_events_all_socios"           ON public.crm_events;
DROP POLICY IF EXISTS "crm_transitions_all_socios"      ON public.crm_transitions;
DROP POLICY IF EXISTS "crm_renewals_all_socios"         ON public.crm_renewals;
DROP POLICY IF EXISTS "crm_entity_links_all_socios"     ON public.crm_entity_links;

-- ===== Función helper — dropear =====
DROP FUNCTION IF EXISTS public.es_socio_tho();
