-- Agrega campos de AFP y sistema de salud a la tabla liquidaciones
-- Ejecutar en Supabase SQL Editor si la tabla ya fue creada

ALTER TABLE liquidaciones
  ADD COLUMN IF NOT EXISTS nombre_afp   text,
  ADD COLUMN IF NOT EXISTS sistema_salud text;
