-- ============================================
-- FIX: conciliado_con_id must be TEXT, not UUID
-- Because facturas_emitidas and other SII-synced
-- records may have integer or non-UUID IDs
-- ============================================

-- Step 1: Drop the column if it exists as UUID and recreate as TEXT
DO $$
BEGIN
    -- Check if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'movimientos_bancarios' 
        AND column_name = 'conciliado_con_id'
    ) THEN
        -- Alter to TEXT (this handles both UUID and other types)
        ALTER TABLE movimientos_bancarios 
            ALTER COLUMN conciliado_con_id TYPE TEXT 
            USING conciliado_con_id::TEXT;
    ELSE
        -- Add if doesn't exist
        ALTER TABLE movimientos_bancarios 
            ADD COLUMN conciliado_con_id TEXT;
    END IF;
    
    -- Ensure other conciliation columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_bancarios' AND column_name = 'conciliado_con_tipo') THEN
        ALTER TABLE movimientos_bancarios ADD COLUMN conciliado_con_tipo TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_bancarios' AND column_name = 'conciliado_at') THEN
        ALTER TABLE movimientos_bancarios ADD COLUMN conciliado_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_bancarios' AND column_name = 'archivo_origen') THEN
        ALTER TABLE movimientos_bancarios ADD COLUMN archivo_origen TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_bancarios' AND column_name = 'numero_documento') THEN
        ALTER TABLE movimientos_bancarios ADD COLUMN numero_documento TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_bancarios' AND column_name = 'sucursal') THEN
        ALTER TABLE movimientos_bancarios ADD COLUMN sucursal TEXT;
    END IF;
END $$;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'movimientos_bancarios'
ORDER BY ordinal_position;
