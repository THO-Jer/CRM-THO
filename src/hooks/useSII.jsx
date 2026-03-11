import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { normalizeRut, parseBoletasRecibidasFile, parseDteFile } from '../lib/siiImport/parsers'

const chunk = (items, size = 300) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const sanitize = (value) => String(value ?? '').trim()

const dedupeBy = (items, buildKey) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = buildKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}


const BOLETAS_HONORARIOS_ALLOWED_COLUMNS = new Set([
  'numero_boleta', 'fecha_emision', 'estado', 'fecha_anulacion',
  'rut_prestador', 'prestador', 'sociedad_profesional',
  'monto_bruto_clp', 'monto_retenido_clp', 'monto_pagado_clp',
  'periodo_anio', 'periodo_mes', 'fuente', 'nombre_archivo_origen', 'import_batch_id',
  'empresa_id',
  // compat legacy boletas
  'fecha', 'rut', 'monto_retencion_clp', 'monto_liquido_clp',
  'monto_bruto_uf', 'monto_retencion_uf', 'monto_liquido_uf',
  'porcentaje_retencion', 'uf_dia', 'descripcion', 'mes_servicio', 'moneda_principal'
])

const FACTURAS_EMITIDAS_ALLOWED_COLUMNS = new Set([
  'tipo_dte', 'folio', 'fecha_emision', 'tipo_despacho', 'forma_pago',
  'rut_emisor', 'razon_social_emisor', 'giro_emisor', 'acteco_emisor', 'codigo_sii_sucursal',
  'direccion_emisor', 'comuna_emisor', 'ciudad_emisor',
  'rut_receptor', 'razon_social_receptor', 'giro_receptor', 'direccion_receptor', 'comuna_receptor', 'ciudad_receptor',
  'total_neto_clp', 'total_exento_clp', 'total_iva_clp', 'total_monto_clp',
  'monto_periodo_clp', 'monto_no_facturable_clp', 'saldo_anterior_clp', 'valor_pagar_clp',
  'detalle_descripcion', 'detalle_cantidad', 'detalle_precio_clp', 'detalle_monto_item_clp',
  'periodo_anio', 'periodo_mes', 'fuente', 'nombre_archivo_origen', 'import_batch_id',
  'empresa_id',
  // legacy real emitidas
  'numero_factura', 'cliente', 'rut_cliente', 'monto_clp', 'monto_uf', 'descripcion', 'estado', 'uf_dia',
  'numero_folio', 'tipo_documento', 'origen', 'fecha_pago', 'ticket_id', 'key_account_id'
])

const FACTURAS_RECIBIDAS_ALLOWED_COLUMNS = new Set([
  'tipo_dte', 'folio', 'fecha_emision', 'tipo_despacho', 'forma_pago',
  'rut_emisor', 'razon_social_emisor', 'giro_emisor', 'acteco_emisor', 'codigo_sii_sucursal',
  'direccion_emisor', 'comuna_emisor', 'ciudad_emisor',
  'rut_receptor', 'razon_social_receptor', 'giro_receptor', 'direccion_receptor', 'comuna_receptor', 'ciudad_receptor',
  'total_neto_clp', 'total_exento_clp', 'total_iva_clp', 'total_monto_clp',
  'monto_periodo_clp', 'monto_no_facturable_clp', 'saldo_anterior_clp', 'valor_pagar_clp',
  'detalle_descripcion', 'detalle_cantidad', 'detalle_precio_clp', 'detalle_monto_item_clp',
  'periodo_anio', 'periodo_mes', 'fuente', 'nombre_archivo_origen', 'import_batch_id',
  'empresa_id',
  // legacy real recibidas
  'numero_factura', 'proveedor', 'rut_proveedor', 'monto_clp', 'monto_uf', 'categoria', 'descripcion',
  'estado', 'fecha_pago', 'incluye_iva', 'monto_neto', 'monto_iva', 'tipo_documento', 'origen', 'uf_dia', 'numero_folio'
])

const pickAllowedColumns = (payload, allowedColumns) => Object.fromEntries(
  Object.entries(payload).filter(([key]) => allowedColumns.has(key))
)

const mapFacturaEmitidaPayload = ({ row, fileName, ufDiaActual }) => {
  const total = Number(row.total_monto_clp || 0)
  const clienteFinal = sanitize(row.razon_social_receptor) || sanitize(row.cliente) || sanitize(row.rut_receptor) || 'Cliente sin nombre'
  const [anio, mes] = String(row.fecha_emision || '').split('-')

  return pickAllowedColumns({
    ...row,
    periodo_anio: anio ? Number(anio) : null,
    periodo_mes: mes ? Number(mes) : null,
    fuente: 'sii_xls',
    nombre_archivo_origen: fileName,
    import_batch_id: null,
    // compat legacy emitidas
    numero_factura: row.folio,
    cliente: clienteFinal,
    rut_cliente: row.rut_receptor,
    monto_clp: total,
    monto_uf: total > 0 ? (total / ufDiaActual).toFixed(2) : '0.00',
    descripcion: row.detalle_descripcion || `DTE ${row.tipo_dte}`,
    estado: 'Pendiente',
    uf_dia: ufDiaActual,
    numero_folio: row.folio,
    tipo_documento: row.tipo_dte ? String(row.tipo_dte) : null,
    origen: 'sii_xls'
  }, FACTURAS_EMITIDAS_ALLOWED_COLUMNS)
}

const mapFacturaRecibidaPayload = ({ row, fileName, ufDiaActual }) => {
  const total = Number(row.total_monto_clp || 0)
  const neto = Number(row.total_neto_clp || 0)
  const iva = Number(row.total_iva_clp || 0)
  const proveedorFinal = sanitize(row.razon_social_emisor) || sanitize(row.proveedor) || sanitize(row.rut_emisor) || 'Proveedor sin nombre'
  const categoriaFinal = sanitize(row.categoria) || 'Sin categorizar'
  const [anio, mes] = String(row.fecha_emision || '').split('-')

  return pickAllowedColumns({
    ...row,
    periodo_anio: anio ? Number(anio) : null,
    periodo_mes: mes ? Number(mes) : null,
    fuente: 'sii_xls',
    nombre_archivo_origen: fileName,
    import_batch_id: null,
    // compat legacy recibidas (sin cliente)
    numero_factura: row.folio,
    proveedor: proveedorFinal,
    rut_proveedor: row.rut_emisor,
    categoria: categoriaFinal,
    monto_clp: total,
    monto_neto: neto,
    monto_iva: iva,
    incluye_iva: iva > 0,
    monto_uf: total > 0 ? (total / ufDiaActual).toFixed(2) : '0.00',
    descripcion: row.detalle_descripcion || `DTE ${row.tipo_dte}`,
    estado: 'Pendiente',
    uf_dia: ufDiaActual,
    numero_folio: row.folio,
    tipo_documento: row.tipo_dte ? String(row.tipo_dte) : null,
    origen: 'sii_xls'
  }, FACTURAS_RECIBIDAS_ALLOWED_COLUMNS)
}


const mapBoletaPayload = ({ row, fileName, ufDiaActual }) => {
  const fecha = row.fecha_emision
  const [anio, mes] = String(fecha || '').split('-')
  const bruto = Number(row.monto_bruto_clp || 0)
  const retenido = Number(row.monto_retenido_clp || 0)
  const pagado = Number(row.monto_pagado_clp || 0)

  return pickAllowedColumns({
    ...row,
    periodo_anio: anio ? Number(anio) : null,
    periodo_mes: mes ? Number(mes) : null,
    fuente: 'sii_xls',
    nombre_archivo_origen: fileName,
    import_batch_id: null,
    // compat legacy UI
    fecha,
    rut: row.rut_prestador,
    monto_retencion_clp: retenido,
    monto_liquido_clp: pagado,
    monto_bruto_uf: bruto > 0 ? (bruto / ufDiaActual).toFixed(2) : '0.00',
    monto_retencion_uf: retenido > 0 ? (retenido / ufDiaActual).toFixed(2) : '0.00',
    monto_liquido_uf: pagado > 0 ? (pagado / ufDiaActual).toFixed(2) : '0.00',
    porcentaje_retencion: bruto > 0 ? ((retenido / bruto) * 100).toFixed(2) : '0',
    uf_dia: ufDiaActual,
    descripcion: `Importado desde SII (${fileName})`,
    mes_servicio: anio && mes ? `${mes}-${anio}` : null,
    moneda_principal: 'CLP'
  }, BOLETAS_HONORARIOS_ALLOWED_COLUMNS)
}

export default function useSII({ ufActual = 38000, loadBoletasHonorarios, loadFacturasEmitidas, loadFacturasRecibidas }) {
  const [loadingType, setLoadingType] = useState(null)
  const ufDiaActual = Number(ufActual) > 0 ? Number(ufActual) : 38000

  const insertInBatches = async (table, rows) => {
    for (const part of chunk(rows)) {
      const { error } = await supabase.from(table).insert(part)
      if (error) throw error
    }
  }

  const importarBoletasRecibidasSII = async (file) => {
    if (!file) return null
    setLoadingType('boletas')
    try {
      const parsed = await parseBoletasRecibidasFile(file)
      const records = parsed.records || []
      const errores = [...(parsed.errors || [])]

      const normalizados = dedupeBy(records, (row) => `${normalizeRut(row.rut_prestador)}|${sanitize(row.numero_boleta)}|${row.fecha_emision || ''}`)
      const { data: existentes, error: existingError } = await supabase
        .from('boletas_honorarios')
        .select('rut_prestador, numero_boleta, fecha_emision, fecha, rut, prestador, monto_bruto_clp')

      if (existingError) throw existingError

      const existingKeys = new Set((existentes || []).map((row) => {
        const rut = normalizeRut(row.rut_prestador || row.rut)
        const numero = sanitize(row.numero_boleta)
        const fecha = sanitize(row.fecha_emision || row.fecha)
        return `${rut}|${numero}|${fecha}`
      }))

      const fallbackKeys = new Set((existentes || []).map((row) => {
        const rut = normalizeRut(row.rut_prestador || row.rut)
        const fecha = sanitize(row.fecha_emision || row.fecha)
        const monto = Number(row.monto_bruto_clp || 0)
        return `${rut}|${fecha}|${monto}`
      }))

      const nuevas = []
      let duplicadas = 0

      for (const row of normalizados) {
        const kMain = `${normalizeRut(row.rut_prestador)}|${sanitize(row.numero_boleta)}|${row.fecha_emision || ''}`
        const kFallback = `${normalizeRut(row.rut_prestador)}|${row.fecha_emision || ''}|${Number(row.monto_bruto_clp || 0)}`
        if (existingKeys.has(kMain) || fallbackKeys.has(kFallback)) {
          duplicadas += 1
          continue
        }

        const boletaPayload = mapBoletaPayload({ row, fileName: file.name, ufDiaActual })
        console.log('[sii-import] boletas_honorarios payload keys', Object.keys(boletaPayload))
        nuevas.push(boletaPayload)

        existingKeys.add(kMain)
        fallbackKeys.add(kFallback)
      }

      if (nuevas.length > 0) await insertInBatches('boletas_honorarios', nuevas)
      await loadBoletasHonorarios?.()

      return { leidos: records.length, insertados: nuevas.length, duplicados: duplicadas, errores: errores.length, detalleErrores: errores }
    } finally {
      setLoadingType(null)
    }
  }

  const importarFacturasSII = async ({ file, tipo }) => {
    if (!file) return null
    const isEmitidas = tipo === 'emitidas'
    const table = isEmitidas ? 'facturas_emitidas' : 'facturas_recibidas'
    setLoadingType(tipo)

    try {
      const parsed = await parseDteFile(file, { tipo })
      const records = parsed.records || []
      const errores = [...(parsed.errors || [])]
      const normalized = dedupeBy(records, (row) => `${row.tipo_dte}|${sanitize(row.folio)}|${normalizeRut(row.rut_emisor)}|${normalizeRut(row.rut_receptor)}|${row.fecha_emision || ''}`)

      const { data: existentes, error: existingError } = await supabase
        .from(table)
        .select('tipo_dte, folio, rut_emisor, rut_receptor, fecha_emision')

      if (existingError) throw existingError

      const existingKeys = new Set((existentes || []).map((row) => `${Number(row.tipo_dte || 0)}|${sanitize(row.folio)}|${normalizeRut(row.rut_emisor)}|${normalizeRut(row.rut_receptor)}|${sanitize(row.fecha_emision)}`))

      const nuevas = []
      let duplicadas = 0

      for (const row of normalized) {
        const key = `${Number(row.tipo_dte || 0)}|${sanitize(row.folio)}|${normalizeRut(row.rut_emisor)}|${normalizeRut(row.rut_receptor)}|${row.fecha_emision || ''}`
        if (existingKeys.has(key)) {
          duplicadas += 1
          continue
        }

        const facturaPayload = isEmitidas
          ? mapFacturaEmitidaPayload({ row, fileName: file.name, ufDiaActual })
          : mapFacturaRecibidaPayload({ row, fileName: file.name, ufDiaActual })

        console.log(`[sii-import] ${table} payload keys`, Object.keys(facturaPayload))
        nuevas.push(facturaPayload)
        existingKeys.add(key)
      }

      if (nuevas.length > 0) await insertInBatches(table, nuevas)
      if (isEmitidas) await loadFacturasEmitidas?.()
      else await loadFacturasRecibidas?.()

      return { leidos: records.length, insertados: nuevas.length, duplicados: duplicadas, errores: errores.length, detalleErrores: errores }
    } finally {
      setLoadingType(null)
    }
  }

  const importarFacturasEmitidasSII = async (file) => importarFacturasSII({ file, tipo: 'emitidas' })
  const importarFacturasRecibidasSII = async (file) => importarFacturasSII({ file, tipo: 'recibidas' })

  return {
    loadingType,
    importarBoletasRecibidasSII,
    importarFacturasEmitidasSII,
    importarFacturasRecibidasSII
  }
}
