import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
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

        const fecha = row.fecha_emision
        const [anio, mes] = (fecha || '').split('-')
        const bruto = Number(row.monto_bruto_clp || 0)
        const retenido = Number(row.monto_retenido_clp || 0)
        const pagado = Number(row.monto_pagado_clp || 0)

        nuevas.push({
          ...row,
          periodo_anio: anio ? Number(anio) : null,
          periodo_mes: mes ? Number(mes) : null,
          fuente: 'sii_xls',
          nombre_archivo_origen: file.name,
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
          descripcion: `Importado desde SII (${file.name})`,
          mes_servicio: anio && mes ? `${mes}-${anio}` : null,
          moneda_principal: 'CLP'
        })

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

        const total = Number(row.total_monto_clp || 0)
        const neto = Number(row.total_neto_clp || 0)
        nuevas.push({
          ...row,
          fuente: 'sii_xls',
          nombre_archivo_origen: file.name,
          // compat legacy UI
          numero_factura: row.folio,
          cliente: row.razon_social_receptor,
          rut_cliente: row.rut_receptor,
          proveedor: row.razon_social_emisor,
          rut_proveedor: row.rut_emisor,
          monto_neto_clp: neto,
          monto_clp: total,
          monto_uf: total > 0 ? (total / ufDiaActual).toFixed(2) : '0.00',
          descripcion: row.detalle_descripcion || `DTE ${row.tipo_dte}`,
          estado: 'Pendiente',
          moneda_principal: 'CLP',
          uf_dia: ufDiaActual
        })

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
