-- =====================================================================
-- accesos-crm.sql — Gestión de accesos al CRM desde la app (oct-2026)
-- =====================================================================
-- Antes: la lista de socios vivía escrita a mano dentro de es_socio_tho()
-- (3 emails) y, en paralelo, en la tabla crm_members (usada por is_crm_member).
-- Después: UNA sola fuente de verdad, la tabla public.crm_members, con
-- rol y estado. Las 24 policies que usan es_socio_tho() y las 15 que usan
-- is_crm_member() NO se tocan: sólo cambia lo que esas funciones consultan.
--
-- Roles:
--   superadmin  todo + administra a cualquiera (incluidos admins)
--   admin       todo + administra usuarios con rol 'usuario'
--   usuario     ve y edita todo el CRM, no administra accesos
-- Desactivar (activo = false) corta el acceso de inmediato sin borrar a nadie.
--
-- Reglas que impone la base (no sólo la pantalla):
--   - sólo superadmin crea/modifica/elimina admins o superadmins
--   - nadie cambia su propio rol/estado ni se elimina a sí mismo
--   - siempre queda al menos un superadmin activo
--   - cada cambio queda registrado en crm_members_log
--
-- Estado inicial: jeremias@tho.cl superadmin, max@tho.cl admin,
-- francisco@tho.cl desactivado.
--
-- CORRER EN: Supabase → SQL Editor. Transacción única e idempotente.
-- ROLLBACK: accesos-crm-rollback.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en crm_members
-- ---------------------------------------------------------------------
ALTER TABLE public.crm_members
  ADD COLUMN IF NOT EXISTS nombre     text,
  ADD COLUMN IF NOT EXISTS rol        text NOT NULL DEFAULT 'usuario',
  ADD COLUMN IF NOT EXISTS activo     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;

UPDATE public.crm_members SET email = lower(trim(email)) WHERE email <> lower(trim(email));

ALTER TABLE public.crm_members DROP CONSTRAINT IF EXISTS crm_members_rol_check;
ALTER TABLE public.crm_members ADD CONSTRAINT crm_members_rol_check
  CHECK (rol IN ('superadmin', 'admin', 'usuario'));
ALTER TABLE public.crm_members DROP CONSTRAINT IF EXISTS crm_members_email_check;
ALTER TABLE public.crm_members ADD CONSTRAINT crm_members_email_check
  CHECK (email = lower(trim(email)) AND email LIKE '_%@_%._%');

COMMENT ON TABLE public.crm_members IS
  'Quién puede entrar al CRM y con qué rol. Se administra desde CRM → Accesos. Ver sql/accesos-crm.sql';

-- ---------------------------------------------------------------------
-- 2. Estado inicial
-- ---------------------------------------------------------------------
INSERT INTO public.crm_members (email, rol, activo, updated_by) VALUES
  ('jeremias@tho.cl',  'superadmin', true,  'migracion accesos-crm'),
  ('max@tho.cl',       'admin',      true,  'migracion accesos-crm'),
  ('francisco@tho.cl', 'usuario',    false, 'migracion accesos-crm')
ON CONFLICT (email) DO UPDATE
  SET rol = EXCLUDED.rol, activo = EXCLUDED.activo,
      updated_at = now(), updated_by = EXCLUDED.updated_by;

-- ---------------------------------------------------------------------
-- 3. Helpers en un schema privado (no expuesto por la API, así nadie
--    puede llamarlos como RPC). SECURITY DEFINER para poder leer
--    crm_members sin chocar con su propio RLS.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.crm_rol_actual()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.rol FROM public.crm_members m
  WHERE m.email = lower(auth.email()) AND m.activo
$$;
REVOKE ALL ON FUNCTION private.crm_rol_actual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.crm_rol_actual() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Las funciones que usan las policies existentes pasan a leer la tabla
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_socio_tho()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.crm_rol_actual() IS NOT NULL $$;

COMMENT ON FUNCTION public.es_socio_tho IS
  'true si el usuario logueado está activo en crm_members (cualquier rol). Usado por las policies RLS del CRM. Se administra desde CRM → Accesos.';

CREATE OR REPLACE FUNCTION public.is_crm_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.crm_rol_actual() IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.crm_es_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT coalesce(private.crm_rol_actual() IN ('superadmin', 'admin'), false) $$;

-- ---------------------------------------------------------------------
-- 5. Bitácora de cambios de acceso
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_members_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha      timestamptz NOT NULL DEFAULT now(),
  actor      text,                 -- email de quien hizo el cambio (NULL = SQL/servidor)
  accion     text NOT NULL,        -- INSERT / UPDATE / DELETE
  email      text NOT NULL,        -- cuenta afectada
  antes      jsonb,
  despues    jsonb
);
ALTER TABLE public.crm_members_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_members_log_admins_leen" ON public.crm_members_log;
CREATE POLICY "crm_members_log_admins_leen" ON public.crm_members_log
  FOR SELECT TO authenticated USING (public.crm_es_admin());
-- sin policies de escritura: sólo la escribe el trigger

-- ---------------------------------------------------------------------
-- 6. Reglas de negocio (trigger)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.crm_members_reglas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  yo      text := lower(auth.email());
  mi_rol  text := private.crm_rol_actual();
  quedan  int;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    NEW.email := lower(trim(NEW.email));
    NEW.updated_at := now();
    NEW.updated_by := coalesce(yo, NEW.updated_by, 'sistema');
  END IF;

  -- Reglas del actor: sólo aplican a cambios hechos desde la app (con sesión).
  -- Desde SQL Editor o service_role (yo IS NULL) se permite mantenimiento.
  IF yo IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.email <> OLD.email THEN
      RAISE EXCEPTION 'No se puede cambiar el email de un acceso. Elimínalo y crea uno nuevo.';
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.email = yo THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'No puedes eliminar tu propio acceso.';
      ELSIF NEW.rol <> OLD.rol OR NEW.activo <> OLD.activo THEN
        RAISE EXCEPTION 'No puedes cambiar tu propio rol ni desactivarte.';
      END IF;
    ELSIF coalesce(mi_rol, '') <> 'superadmin' AND (
         (TG_OP <> 'INSERT' AND OLD.rol IN ('superadmin', 'admin'))
      OR (TG_OP <> 'DELETE' AND NEW.rol IN ('superadmin', 'admin'))
    ) THEN
      RAISE EXCEPTION 'Sólo el superadmin puede crear, modificar o eliminar administradores.';
    END IF;
  END IF;

  -- Siempre debe quedar al menos un superadmin activo.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.rol = 'superadmin' AND OLD.activo
     AND (TG_OP = 'DELETE' OR NEW.rol <> 'superadmin' OR NOT NEW.activo) THEN
    SELECT count(*) INTO quedan FROM public.crm_members
     WHERE rol = 'superadmin' AND activo AND email <> OLD.email;
    IF quedan = 0 THEN
      RAISE EXCEPTION 'Debe quedar al menos un superadmin activo.';
    END IF;
  END IF;

  INSERT INTO public.crm_members_log (actor, accion, email, antes, despues)
  VALUES (yo, TG_OP,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.email ELSE NEW.email END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.crm_members_reglas() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_crm_members_reglas ON public.crm_members;
CREATE TRIGGER trg_crm_members_reglas
  BEFORE INSERT OR UPDATE OR DELETE ON public.crm_members
  FOR EACH ROW EXECUTE FUNCTION private.crm_members_reglas();

-- ---------------------------------------------------------------------
-- 7. RLS de crm_members
--    Cada uno ve su propia fila (aunque esté desactivado, para que la app
--    le explique por qué no entra). Admins ven y editan todas.
-- ---------------------------------------------------------------------
ALTER TABLE public.crm_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members can read membership table" ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_leer"       ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_insertar"   ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_actualizar" ON public.crm_members;
DROP POLICY IF EXISTS "crm_members_borrar"     ON public.crm_members;
CREATE POLICY "crm_members_leer" ON public.crm_members
  FOR SELECT TO authenticated
  USING (email = lower(auth.email()) OR public.crm_es_admin());
CREATE POLICY "crm_members_insertar" ON public.crm_members
  FOR INSERT TO authenticated WITH CHECK (public.crm_es_admin());
CREATE POLICY "crm_members_actualizar" ON public.crm_members
  FOR UPDATE TO authenticated USING (public.crm_es_admin()) WITH CHECK (public.crm_es_admin());
CREATE POLICY "crm_members_borrar" ON public.crm_members
  FOR DELETE TO authenticated USING (public.crm_es_admin());

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (por separado)
-- =====================================================================
-- select email, rol, activo from public.crm_members order by rol, email;
-- Entra al CRM con tu cuenta Microsoft: debería verse "Accesos" en el menú.
