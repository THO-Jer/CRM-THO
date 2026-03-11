-- Ajustes mínimos para soportar importación manual SII (.xls HTML / .xlsx)

-- 1) BOLETAS HONORARIOS
ALTER TABLE IF EXISTS public.boletas_honorarios
  ADD COLUMN IF NOT EXISTS numero_boleta text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS fecha_anulacion date,
  ADD COLUMN IF NOT EXISTS rut_prestador text,
  ADD COLUMN IF NOT EXISTS sociedad_profesional boolean,
  ADD COLUMN IF NOT EXISTS monto_retenido_clp integer,
  ADD COLUMN IF NOT EXISTS monto_pagado_clp integer,
  ADD COLUMN IF NOT EXISTS periodo_anio integer,
  ADD COLUMN IF NOT EXISTS periodo_mes integer,
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'sii_xls',
  ADD COLUMN IF NOT EXISTS nombre_archivo_origen text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_boletas_honorarios_rut_numero_fecha
  ON public.boletas_honorarios (rut_prestador, numero_boleta, fecha_emision)
  WHERE rut_prestador IS NOT NULL AND numero_boleta IS NOT NULL AND fecha_emision IS NOT NULL;

-- 2) FACTURAS EMITIDAS
ALTER TABLE IF EXISTS public.facturas_emitidas
  ADD COLUMN IF NOT EXISTS tipo_dte integer,
  ADD COLUMN IF NOT EXISTS folio text,
  ADD COLUMN IF NOT EXISTS tipo_despacho text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS rut_emisor text,
  ADD COLUMN IF NOT EXISTS razon_social_emisor text,
  ADD COLUMN IF NOT EXISTS giro_emisor text,
  ADD COLUMN IF NOT EXISTS acteco_emisor text,
  ADD COLUMN IF NOT EXISTS codigo_sii_sucursal text,
  ADD COLUMN IF NOT EXISTS direccion_emisor text,
  ADD COLUMN IF NOT EXISTS comuna_emisor text,
  ADD COLUMN IF NOT EXISTS ciudad_emisor text,
  ADD COLUMN IF NOT EXISTS rut_receptor text,
  ADD COLUMN IF NOT EXISTS razon_social_receptor text,
  ADD COLUMN IF NOT EXISTS giro_receptor text,
  ADD COLUMN IF NOT EXISTS direccion_receptor text,
  ADD COLUMN IF NOT EXISTS comuna_receptor text,
  ADD COLUMN IF NOT EXISTS ciudad_receptor text,
  ADD COLUMN IF NOT EXISTS total_neto_clp integer,
  ADD COLUMN IF NOT EXISTS total_exento_clp integer,
  ADD COLUMN IF NOT EXISTS total_iva_clp integer,
  ADD COLUMN IF NOT EXISTS total_monto_clp integer,
  ADD COLUMN IF NOT EXISTS monto_periodo_clp integer,
  ADD COLUMN IF NOT EXISTS monto_no_facturable_clp integer,
  ADD COLUMN IF NOT EXISTS saldo_anterior_clp integer,
  ADD COLUMN IF NOT EXISTS valor_pagar_clp integer,
  ADD COLUMN IF NOT EXISTS detalle_descripcion text,
  ADD COLUMN IF NOT EXISTS detalle_cantidad numeric,
  ADD COLUMN IF NOT EXISTS detalle_precio_clp numeric,
  ADD COLUMN IF NOT EXISTS detalle_monto_item_clp integer,
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'sii_xls',
  ADD COLUMN IF NOT EXISTS nombre_archivo_origen text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_emitidas_dte_folio_partes
  ON public.facturas_emitidas (tipo_dte, folio, rut_emisor, rut_receptor, fecha_emision)
  WHERE tipo_dte IS NOT NULL AND folio IS NOT NULL AND rut_emisor IS NOT NULL AND rut_receptor IS NOT NULL AND fecha_emision IS NOT NULL;

-- 3) FACTURAS RECIBIDAS
ALTER TABLE IF EXISTS public.facturas_recibidas
  ADD COLUMN IF NOT EXISTS tipo_dte integer,
  ADD COLUMN IF NOT EXISTS folio text,
  ADD COLUMN IF NOT EXISTS tipo_despacho text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS rut_emisor text,
  ADD COLUMN IF NOT EXISTS razon_social_emisor text,
  ADD COLUMN IF NOT EXISTS giro_emisor text,
  ADD COLUMN IF NOT EXISTS acteco_emisor text,
  ADD COLUMN IF NOT EXISTS codigo_sii_sucursal text,
  ADD COLUMN IF NOT EXISTS direccion_emisor text,
  ADD COLUMN IF NOT EXISTS comuna_emisor text,
  ADD COLUMN IF NOT EXISTS ciudad_emisor text,
  ADD COLUMN IF NOT EXISTS rut_receptor text,
  ADD COLUMN IF NOT EXISTS razon_social_receptor text,
  ADD COLUMN IF NOT EXISTS giro_receptor text,
  ADD COLUMN IF NOT EXISTS direccion_receptor text,
  ADD COLUMN IF NOT EXISTS comuna_receptor text,
  ADD COLUMN IF NOT EXISTS ciudad_receptor text,
  ADD COLUMN IF NOT EXISTS total_neto_clp integer,
  ADD COLUMN IF NOT EXISTS total_exento_clp integer,
  ADD COLUMN IF NOT EXISTS total_iva_clp integer,
  ADD COLUMN IF NOT EXISTS total_monto_clp integer,
  ADD COLUMN IF NOT EXISTS monto_periodo_clp integer,
  ADD COLUMN IF NOT EXISTS monto_no_facturable_clp integer,
  ADD COLUMN IF NOT EXISTS saldo_anterior_clp integer,
  ADD COLUMN IF NOT EXISTS valor_pagar_clp integer,
  ADD COLUMN IF NOT EXISTS detalle_descripcion text,
  ADD COLUMN IF NOT EXISTS detalle_cantidad numeric,
  ADD COLUMN IF NOT EXISTS detalle_precio_clp numeric,
  ADD COLUMN IF NOT EXISTS detalle_monto_item_clp integer,
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'sii_xls',
  ADD COLUMN IF NOT EXISTS nombre_archivo_origen text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_recibidas_dte_folio_partes
  ON public.facturas_recibidas (tipo_dte, folio, rut_emisor, rut_receptor, fecha_emision)
  WHERE tipo_dte IS NOT NULL AND folio IS NOT NULL AND rut_emisor IS NOT NULL AND rut_receptor IS NOT NULL AND fecha_emision IS NOT NULL;
