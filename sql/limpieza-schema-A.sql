-- =====================================================================
-- limpieza-schema-A.sql — Limpieza de schema drift (parte A: segura)
-- =====================================================================
-- Esta migración es idempotente: correrla varias veces no rompe nada.
--
-- Cambios:
--   1. Agrega la columna `moneda_principal` a `facturas_recibidas`
--      (faltaba en el schema y el código del modal la intentaba insertar,
--      por eso había que filtrarla defensivamente antes del insert).
--   2. Normaliza el estado "Reclamado" → "Reclamada" en
--      `facturas_emitidas` y `facturas_recibidas`. El código del CRM
--      hoy setea "Reclamada" (femenino, desde el confirmModal cuando se
--      anula una factura), pero quedaron registros legacy con
--      "Reclamado" (masculino).
--
-- NO hace todavía:
--   - Normalización de `entidad_tipo` keyaccount vs key_account.
--     Requiere coordinar con cambios en el código. Pendiente para
--     siguiente migración (parte B).
--
-- CORRER EN: Supabase Dashboard → SQL Editor → New query → pegar y Run.
-- ROLLBACK: ver sql/limpieza-schema-A-rollback.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Agregar columna moneda_principal a facturas_recibidas
-- ---------------------------------------------------------------------
ALTER TABLE public.facturas_recibidas
    ADD COLUMN IF NOT EXISTS moneda_principal text DEFAULT 'UF';

-- Para registros existentes que quedaron con NULL al agregar la columna,
-- les seteamos el default 'UF' explícitamente.
UPDATE public.facturas_recibidas
SET moneda_principal = 'UF'
WHERE moneda_principal IS NULL;

-- Opcional: agregar CHECK para que solo acepte 'UF' o 'CLP' (igual que el
-- código del ContaModal). Comentado por si quieres ver primero qué valores
-- hay; si todo limpio, descomentar y correr.
-- ALTER TABLE public.facturas_recibidas
--     ADD CONSTRAINT facturas_recibidas_moneda_check
--     CHECK (moneda_principal IN ('UF', 'CLP'));


-- ---------------------------------------------------------------------
-- 2. Normalizar "Reclamado" → "Reclamada"
-- ---------------------------------------------------------------------

-- facturas_emitidas
UPDATE public.facturas_emitidas
SET estado = 'Reclamada'
WHERE estado = 'Reclamado';

-- facturas_recibidas
UPDATE public.facturas_recibidas
SET estado = 'Reclamada'
WHERE estado = 'Reclamado';


-- =====================================================================
-- 3. Verificación post-aplicación
-- =====================================================================
-- Correr estas queries por separado para confirmar que quedó todo limpio:
--
-- (a) Confirmar que la columna existe en facturas_recibidas:
--     SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--     WHERE table_schema = 'public'
--       AND table_name = 'facturas_recibidas'
--       AND column_name = 'moneda_principal';
--
-- (b) Confirmar que NO hay más "Reclamado" (masculino) en ningún lado:
--     SELECT 'facturas_emitidas' AS tabla, COUNT(*) AS pendientes
--     FROM public.facturas_emitidas WHERE estado = 'Reclamado'
--     UNION ALL
--     SELECT 'facturas_recibidas', COUNT(*)
--     FROM public.facturas_recibidas WHERE estado = 'Reclamado';
--
--     Las dos filas deben dar 0.
--
-- (c) Distribución actual de estados (sanity check):
--     SELECT estado, COUNT(*) FROM public.facturas_emitidas GROUP BY estado
--     ORDER BY 2 DESC;
--     SELECT estado, COUNT(*) FROM public.facturas_recibidas GROUP BY estado
--     ORDER BY 2 DESC;
-- =====================================================================
