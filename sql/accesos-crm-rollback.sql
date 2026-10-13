-- ROLLBACK de accesos-crm.sql — vuelve a la lista fija de 3 emails.
-- (deja las columnas nuevas y la bitácora; no borran nada ni dan acceso)
BEGIN;
CREATE OR REPLACE FUNCTION public.es_socio_tho()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT auth.email() IN ('jeremias@tho.cl', 'max@tho.cl', 'francisco@tho.cl');
$$;
CREATE OR REPLACE FUNCTION public.is_crm_member()
RETURNS boolean LANGUAGE sql STABLE AS $$
  select exists (select 1 from public.crm_members m where lower(m.email) = lower(auth.email()));
$$;
DROP TRIGGER IF EXISTS trg_crm_members_reglas ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_leer"       ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_insertar"   ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_actualizar" ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_borrar"     ON public.crm_members;
CREATE POLICY "members can read membership table" ON public.crm_members
  FOR SELECT TO authenticated USING (lower(email) = lower(auth.email()));
COMMIT;
