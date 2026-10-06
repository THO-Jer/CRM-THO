-- =====================================================================
-- plan-cobros.sql — Plan de cobro por cliente (Ticket / Key Account)
-- =====================================================================
-- Objetivo: que el acuerdo comercial (duración, monto por cuota, moneda,
-- UF pactada) viva en el CRM y no solo en el Word del contrato. Con eso
-- el CRM puede decir, cruzando con facturas_emitidas, qué cuotas ya se
-- facturaron, cuáles se pagaron y cuáles faltan por facturar.
--
-- Modelo:
--   planes_cobro   1 plan activo por Ticket o Key Account.
--                  Guarda moneda (UF/CLP), regla de UF (congelada al cierre
--                  o del día de emisión) y la UF pactada.
--   cuotas_cobro   N cuotas por plan (mensuales iguales u hitos con montos
--                  y fechas distintos). Cada cuota se "cumple" cuando se le
--                  vincula una factura emitida (factura_id). El estado
--                  (por facturar / atrasada / facturada / pagada) se deriva
--                  en la app cruzando con facturas_emitidas: no hay que
--                  mantenerlo a mano.
--
-- CORRER EN: Supabase Dashboard → SQL Editor → New query → pegar y Run.
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ROLLBACK: al final del archivo (comentado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Planes de cobro
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planes_cobro (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entidad_tipo     text NOT NULL CHECK (entidad_tipo IN ('ticket', 'key_account')),
    entidad_id       text NOT NULL,          -- tickets.id / key_accounts.id (text para tolerar uuid o int)
    organizacion     text,
    servicio         text,
    modalidad        text NOT NULL DEFAULT 'mensual' CHECK (modalidad IN ('mensual', 'hitos')),
    moneda           text NOT NULL DEFAULT 'UF'      CHECK (moneda IN ('UF', 'CLP')),
    -- 'congelada'   = práctica THO: UF del día de cierre/firma, fija para todas las cuotas
    -- 'dia_emision' = cada factura con la UF del día en que se emite
    regla_uf         text NOT NULL DEFAULT 'congelada' CHECK (regla_uf IN ('congelada', 'dia_emision')),
    uf_pactada       numeric(12,2),
    fecha_uf_pactada date,
    dia_facturacion  smallint CHECK (dia_facturacion BETWEEN 1 AND 31),
    estado           text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'finalizado', 'cancelado')),
    documento_url    text,                   -- link al acuerdo/contrato en la nube
    notas            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by_email text,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);

-- Un solo plan vigente por Ticket/KA (los eliminados no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS ux_planes_cobro_entidad
    ON public.planes_cobro (entidad_tipo, entidad_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.planes_cobro IS 'Acuerdo de cobro de un Ticket o Key Account (duración, moneda, UF pactada). Ver sql/plan-cobros.sql';

-- ---------------------------------------------------------------------
-- 2. Cuotas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuotas_cobro (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          uuid NOT NULL REFERENCES public.planes_cobro(id) ON DELETE CASCADE,
    numero           smallint NOT NULL,
    fecha_programada date NOT NULL,          -- cuándo corresponde facturar esta cuota
    glosa            text,                   -- "Cuota 3/12 — marzo 2026" / "Hito 2: informe diagnóstico"
    monto            numeric(14,2) NOT NULL CHECK (monto >= 0),   -- en la moneda del plan
    factura_id       text,                   -- facturas_emitidas.id cuando ya se facturó
    omitida          boolean NOT NULL DEFAULT false,              -- cuota que se acordó no cobrar
    notas            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cuotas_cobro_plan  ON public.cuotas_cobro (plan_id, numero);
CREATE INDEX IF NOT EXISTS ix_cuotas_cobro_fecha ON public.cuotas_cobro (fecha_programada);
CREATE INDEX IF NOT EXISTS ix_cuotas_cobro_fact  ON public.cuotas_cobro (factura_id) WHERE factura_id IS NOT NULL;

COMMENT ON TABLE public.cuotas_cobro IS 'Cuotas/hitos de un plan de cobro. Estado derivado: factura_id NULL = por facturar; con factura = facturada/pagada según facturas_emitidas.estado.';

-- ---------------------------------------------------------------------
-- 3. updated_at automático
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_planes_cobro_updated ON public.planes_cobro;
CREATE TRIGGER trg_planes_cobro_updated BEFORE UPDATE ON public.planes_cobro
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cuotas_cobro_updated ON public.cuotas_cobro;
CREATE TRIGGER trg_cuotas_cobro_updated BEFORE UPDATE ON public.cuotas_cobro
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS — mismo patrón que el resto del CRM (solo los 3 socios)
--    Requiere que exista public.es_socio_tho() (sql/cerrar-policies.sql).
-- ---------------------------------------------------------------------
ALTER TABLE public.planes_cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas_cobro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planes_cobro_socios" ON public.planes_cobro;
CREATE POLICY "planes_cobro_socios" ON public.planes_cobro
    FOR ALL TO authenticated
    USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

DROP POLICY IF EXISTS "cuotas_cobro_socios" ON public.cuotas_cobro;
CREATE POLICY "cuotas_cobro_socios" ON public.cuotas_cobro
    FOR ALL TO authenticated
    USING (public.es_socio_tho()) WITH CHECK (public.es_socio_tho());

-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('planes_cobro', 'cuotas_cobro')
ORDER BY table_name, ordinal_position;

-- ---------------------------------------------------------------------
-- ROLLBACK (solo si hay que deshacer todo; BORRA los planes cargados)
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS public.cuotas_cobro;
-- DROP TABLE IF EXISTS public.planes_cobro;
