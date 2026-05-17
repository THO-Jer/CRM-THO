-- =====================================================================
-- limpieza-schema-A-rollback.sql — Revertir limpieza-schema-A.sql
-- =====================================================================
-- USAR SOLO SI: aplicaste limpieza-schema-A.sql y necesitás volver al
-- estado anterior por algún motivo.
--
-- Notas:
--   - El rollback DROPea la columna moneda_principal de facturas_recibidas.
--     Si ya guardaste filas con valor distinto a NULL en esa columna,
--     ESOS DATOS SE PIERDEN. Si dudas, exporta primero la tabla.
--   - La normalización Reclamado → Reclamada no se revierte porque no
--     guardamos qué filas tenían cada valor. Para volver al estado mixto
--     tendrías que restaurar de un backup.
-- =====================================================================

-- 1. Si agregaste el CHECK constraint en la migración, dropearlo primero
ALTER TABLE public.facturas_recibidas
    DROP CONSTRAINT IF EXISTS facturas_recibidas_moneda_check;

-- 2. Drop columna moneda_principal
ALTER TABLE public.facturas_recibidas
    DROP COLUMN IF EXISTS moneda_principal;
