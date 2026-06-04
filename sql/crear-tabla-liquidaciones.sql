-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla: liquidaciones
-- Propósito: Registrar liquidaciones de sueldo de trabajadores contratados.
--            Distinta a boletas_honorarios (prestadores independientes).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS liquidaciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación del trabajador
  trabajador            text NOT NULL,
  rut_trabajador        text,

  -- Período (fecha del primer día del mes, ej: 2026-06-01)
  periodo               date NOT NULL,

  -- ── Haberes ──────────────────────────────────────────────────────────────
  sueldo_base           numeric(12,2) DEFAULT 0,
  gratificacion         numeric(12,2) DEFAULT 0,   -- gratificación mensual proporcional
  colacion              numeric(12,2) DEFAULT 0,
  movilizacion          numeric(12,2) DEFAULT 0,
  otros_haberes         numeric(12,2) DEFAULT 0,
  total_haberes         numeric(12,2) GENERATED ALWAYS AS (
                          sueldo_base + gratificacion + colacion + movilizacion + otros_haberes
                        ) STORED,

  -- ── Previsión y salud ────────────────────────────────────────────────────
  nombre_afp            text,                       -- ej: 'MODELO', 'HABITAT', 'CUPRUM'
  sistema_salud         text,                       -- ej: 'FONASA', 'ISAPRE COLMENA'

  -- ── Descuentos trabajador ────────────────────────────────────────────────
  afp_trabajador        numeric(12,2) DEFAULT 0,   -- ~10.58% sobre imponible
  salud_trabajador      numeric(12,2) DEFAULT 0,   -- 7% sobre imponible
  afc_trabajador        numeric(12,2) DEFAULT 0,   -- 0.6% sobre imponible
  impuesto_unico        numeric(12,2) DEFAULT 0,
  otros_descuentos      numeric(12,2) DEFAULT 0,
  total_descuentos      numeric(12,2) GENERATED ALWAYS AS (
                          afp_trabajador + salud_trabajador + afc_trabajador + impuesto_unico + otros_descuentos
                        ) STORED,

  -- ── Líquido a pagar ──────────────────────────────────────────────────────
  liquido_pagar         numeric(12,2) GENERATED ALWAYS AS (
                          sueldo_base + gratificacion + colacion + movilizacion + otros_haberes
                          - afp_trabajador - salud_trabajador - afc_trabajador - impuesto_unico - otros_descuentos
                        ) STORED,

  -- ── Costo empleador (adicional al sueldo bruto) ──────────────────────────
  afp_empleador         numeric(12,2) DEFAULT 0,   -- ~2.35% SIS + seguro invalidez
  afc_empleador         numeric(12,2) DEFAULT 0,   -- 2.4% sobre imponible
  seguro_accidentes     numeric(12,2) DEFAULT 0,   -- mutualidad (~0.93% base)
  costo_total_empleador numeric(12,2) GENERATED ALWAYS AS (
                          sueldo_base + gratificacion + colacion + movilizacion + otros_haberes
                          + afp_empleador + afc_empleador + seguro_accidentes
                        ) STORED,

  -- ── Equivalencia en UF ───────────────────────────────────────────────────
  uf_dia                numeric(10,4),
  monto_uf              numeric(10,4),             -- costo_total_empleador / uf_dia

  -- ── Metadatos ────────────────────────────────────────────────────────────
  estado                text NOT NULL DEFAULT 'Pagada' CHECK (estado IN ('Pagada', 'Pendiente', 'Anulada')),
  notas                 text,
  created_at            timestamptz DEFAULT now()
);

-- RLS: solo socios THO pueden ver y modificar
ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "socios_tho_all" ON liquidaciones
  FOR ALL
  USING (es_socio_tho())
  WITH CHECK (es_socio_tho());

-- Índice por período para filtros temporales
CREATE INDEX IF NOT EXISTS liquidaciones_periodo_idx ON liquidaciones (periodo);
