-- ============================================
-- CRM THO - Bloque 2: Migración de datos
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. TABLA CONTACTOS
-- Personas vinculadas a organizaciones
CREATE TABLE IF NOT EXISTS contactos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organizacion TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cargo TEXT,
    email TEXT,
    telefono TEXT,
    linkedin TEXT,
    notas TEXT,
    es_principal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_email TEXT
);

-- Índice para búsqueda por organización
CREATE INDEX IF NOT EXISTS idx_contactos_org ON contactos(organizacion);

-- RLS
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contactos_all" ON contactos FOR ALL USING (true) WITH CHECK (true);

-- 2. TABLA NOTAS
-- Notas y actividades vinculadas a cualquier entidad
CREATE TABLE IF NOT EXISTS notas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    entidad_tipo TEXT NOT NULL,          -- 'prospecto', 'cerrado', 'ticket', 'keyaccount'
    entidad_id UUID NOT NULL,
    tipo TEXT DEFAULT 'nota',            -- 'nota', 'llamada', 'reunion', 'email', 'tarea'
    contenido TEXT NOT NULL,
    completada BOOLEAN DEFAULT false,    -- Para tipo 'tarea'
    fecha_actividad TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_email TEXT
);

-- Índice para búsqueda por entidad
CREATE INDEX IF NOT EXISTS idx_notas_entidad ON notas(entidad_tipo, entidad_id);

-- RLS
ALTER TABLE notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notas_all" ON notas FOR ALL USING (true) WITH CHECK (true);

-- 3. CAMPOS ADICIONALES EN CERRADOS
-- Agregar campos que faltan para historial completo
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS contacto TEXT;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS fecha_inicio TEXT;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS fecha_termino TEXT;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS duracion_meses INTEGER;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE cerrados ADD COLUMN IF NOT EXISTS convertido_a TEXT;  -- 'ticket', 'keyaccount' si se reactivó

-- ============================================
-- VERIFICACIÓN: Ejecutar después de la migración
-- ============================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contactos' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notas' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'cerrados' AND column_name IN ('fecha_inicio', 'fecha_termino', 'motivo_cierre', 'contacto');
