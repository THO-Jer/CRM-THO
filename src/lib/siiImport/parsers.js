import * as XLSX from 'xlsx'

const normalizeText = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const normalizeHeader = (value) => normalizeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

export const normalizeRut = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (!cleaned) return ''
  if (cleaned.length <= 1) return cleaned
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`
}

export const parseChileanDate = (value) => {
  const txt = normalizeText(value)
  if (!txt) return null
  const dmY = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmY) {
    const dd = dmY[1].padStart(2, '0')
    const mm = dmY[2].padStart(2, '0')
    return `${dmY[3]}-${mm}-${dd}`
  }
  const iso = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  return txt || null
}

export const parseIntegerCLP = (value) => {
  if (typeof value === 'number') return Math.round(value)
  const txt = normalizeText(value)
  if (!txt) return 0
  const cleaned = txt.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const num = Number.parseFloat(cleaned)
  return Number.isFinite(num) ? Math.round(num) : 0
}

export const parseNumeric = (value) => {
  if (typeof value === 'number') return value
  const txt = normalizeText(value)
  if (!txt) return null
  const cleaned = txt.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const num = Number.parseFloat(cleaned)
  return Number.isFinite(num) ? num : null
}

const rowIsEmpty = (row) => (row || []).every((cell) => !normalizeText(cell))

const findNextDataRow = (rows, startIndex) => {
  for (let i = startIndex; i < rows.length; i += 1) {
    if (!rowIsEmpty(rows[i])) return { row: rows[i], index: i }
  }
  return null
}

export const parseSiiHtmlTable = (content) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')
  const trs = Array.from(doc.querySelectorAll('tr'))
  return trs.map((tr) => Array.from(tr.querySelectorAll('th,td')).map((cell) => normalizeText(cell.textContent)))
}

const mapColumns = (headerRow) => {
  const normalized = headerRow.map(normalizeHeader)
  const find = (options) => normalized.findIndex((h) => options.includes(h))
  return {
    numero: find(['n°', 'nº', 'n']),
    fecha: find(['fecha']),
    estado: find(['estado']),
    fechaAnulacion: find(['fecha anulacion']),
    rut: find(['rut']),
    nombre: find(['nombre o razon social']),
    sociedadProfesional: find(['soc. prof.', 'soc. prof']),
    brutos: find(['brutos']),
    retenido: find(['retenido']),
    pagado: find(['pagado'])
  }
}

const parseBoletasRows = (rows) => {
  const headerIndex = rows.findIndex((row) => {
    const norm = row.map(normalizeHeader)
    return norm.includes('rut') && norm.includes('brutos') && norm.includes('nombre o razon social')
  })

  if (headerIndex === -1) {
    throw new Error('No se detectó encabezado de Boletas Recibidas SII (Rut, Nombre o Razón Social, Brutos).')
  }

  const columns = mapColumns(rows[headerIndex])
  const required = [columns.fecha, columns.rut, columns.nombre, columns.brutos, columns.retenido, columns.pagado]
  if (required.some((idx) => idx < 0)) {
    throw new Error('No se pudieron mapear columnas clave en Boletas (Fecha, Rut, Nombre, Brutos, Retenido, Pagado).')
  }

  const records = []
  const errors = []

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || []
    const firstCell = normalizeHeader(row[0])
    if (firstCell.includes('totales')) break
    if (rowIsEmpty(row)) continue

    const numeroBoleta = normalizeText(row[columns.numero])
    const rutPrestador = normalizeRut(row[columns.rut])
    const prestador = normalizeText(row[columns.nombre])
    if (!rutPrestador && !prestador && !numeroBoleta) continue

    const fechaEmision = parseChileanDate(row[columns.fecha])
    if (!fechaEmision) {
      errors.push({ fila: i + 1, motivo: 'Fecha inválida o vacía' })
      continue
    }

    const sociedadRaw = normalizeHeader(row[columns.sociedadProfesional])
    const sociedadProfesional = sociedadRaw ? ['si', 'sí', 's'].includes(sociedadRaw) : null

    records.push({
      numero_boleta: numeroBoleta,
      fecha_emision: fechaEmision,
      estado: normalizeText(row[columns.estado]),
      fecha_anulacion: parseChileanDate(row[columns.fechaAnulacion]),
      rut_prestador: rutPrestador,
      prestador,
      sociedad_profesional: sociedadProfesional,
      monto_bruto_clp: parseIntegerCLP(row[columns.brutos]),
      monto_retenido_clp: parseIntegerCLP(row[columns.retenido]),
      monto_pagado_clp: parseIntegerCLP(row[columns.pagado])
    })
  }

  return { records, errors }
}

const parseDteRows = (rows) => {
  const records = []
  const errors = []
  let i = 0

  while (i < rows.length) {
    const row = rows[i] || []
    if (normalizeHeader(row[0]) !== 'tipodte') {
      i += 1
      continue
    }

    const header = row.map(normalizeText)
    const dataRef = findNextDataRow(rows, i + 1)
    if (!dataRef) break

    const data = dataRef.row
    const get = (name, occurrence = 1) => {
      const target = normalizeHeader(name)
      let found = 0
      for (let idx = 0; idx < header.length; idx += 1) {
        if (normalizeHeader(header[idx]) === target) {
          found += 1
          if (found === occurrence) return data[idx]
        }
      }
      return ''
    }

    const record = {
      tipo_dte: Number.parseInt(get('TipoDTE'), 10) || null,
      folio: normalizeText(get('Folio')),
      fecha_emision: parseChileanDate(get('FechaEmision')),
      tipo_despacho: normalizeText(get('TipoDespacho')),
      forma_pago: normalizeText(get('FormaPago')),
      rut_emisor: normalizeRut(get('RutEmisor')),
      razon_social_emisor: normalizeText(get('RazonSocialEmisor')),
      giro_emisor: normalizeText(get('GiroEmisor')),
      acteco_emisor: normalizeText(get('Acteco')),
      codigo_sii_sucursal: normalizeText(get('CodSIISucursal')),
      direccion_emisor: normalizeText(get('Direccion')),
      comuna_emisor: normalizeText(get('Comuna')),
      ciudad_emisor: normalizeText(get('Ciudad')),
      rut_receptor: normalizeRut(get('RutReceptor')),
      razon_social_receptor: normalizeText(get('RazonSocialReceptor')),
      giro_receptor: normalizeText(get('GiroReceptor')),
      direccion_receptor: normalizeText(get('Direccion', 2)),
      comuna_receptor: normalizeText(get('Comuna', 2)),
      ciudad_receptor: normalizeText(get('Ciudad', 2)),
      total_neto_clp: parseIntegerCLP(get('Total-Neto')),
      total_exento_clp: parseIntegerCLP(get('Total-Exento')),
      total_iva_clp: parseIntegerCLP(get('Total-IVA')),
      total_monto_clp: parseIntegerCLP(get('Total-MontoTotal')),
      monto_periodo_clp: parseIntegerCLP(get('MontoPeriodo')),
      monto_no_facturable_clp: parseIntegerCLP(get('Monto-NoFacturable')),
      saldo_anterior_clp: parseIntegerCLP(get('Saldo-Anterior')),
      valor_pagar_clp: parseIntegerCLP(get('ValorPagar')),
      detalle_descripcion: null,
      detalle_cantidad: null,
      detalle_precio_clp: null,
      detalle_monto_item_clp: null
    }

    if (!record.folio || !record.rut_emisor || !record.rut_receptor || !record.fecha_emision) {
      errors.push({ fila: dataRef.index + 1, motivo: 'Documento DTE con campos obligatorios incompletos', folio: record.folio })
      i = dataRef.index + 1
      continue
    }

    let cursor = dataRef.index + 1
    while (cursor < rows.length) {
      const scan = rows[cursor] || []
      const first = normalizeHeader(scan[0])
      if (first === 'tipodte') break
      if (first === 'detalle') {
        const detailRef = findNextDataRow(rows, cursor + 1)
        if (detailRef) {
          const detailHeader = scan.map(normalizeText)
          const detailMap = new Map(detailHeader.map((h, idx) => [normalizeHeader(h), idx]))
          const detailRow = detailRef.row
          const getDetail = (name) => {
            const idx = detailMap.get(normalizeHeader(name))
            return idx === undefined ? '' : detailRow[idx]
          }
          record.detalle_descripcion = normalizeText(getDetail('Descripcion')) || null
          record.detalle_cantidad = parseNumeric(getDetail('Cantidad'))
          record.detalle_precio_clp = parseNumeric(getDetail('Precio'))
          record.detalle_monto_item_clp = parseIntegerCLP(getDetail('Monto-Item'))
          cursor = detailRef.index + 1
          continue
        }
      }
      cursor += 1
    }

    records.push(record)
    i = cursor
  }

  return { records, errors }
}

const isHtmlSpreadsheet = (text) => {
  const trimmed = String(text || '').trim().toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('<table')
}

const rowsFromWorkbook = async (file) => {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
}

const rowsFromFile = async (file) => {
  const name = String(file?.name || '').toLowerCase()
  if (!(name.endsWith('.xls') || name.endsWith('.xlsx'))) {
    throw new Error('El archivo debe tener extensión .xls o .xlsx')
  }

  if (name.endsWith('.xlsx')) return rowsFromWorkbook(file)

  const content = await file.text()
  if (isHtmlSpreadsheet(content)) return parseSiiHtmlTable(content)

  return rowsFromWorkbook(file)
}

export const parseBoletasRecibidasHtml = (content) => parseBoletasRows(parseSiiHtmlTable(content))

export const parseDteHtml = (content, { tipo } = { tipo: 'emitidas' }) => {
  if (!['emitidas', 'recibidas'].includes(tipo)) {
    throw new Error('Tipo DTE inválido; debe ser emitidas o recibidas')
  }
  return parseDteRows(parseSiiHtmlTable(content))
}

export const parseBoletasRecibidasFile = async (file) => {
  const rows = await rowsFromFile(file)
  return parseBoletasRows(rows)
}

export const parseDteFile = async (file, { tipo }) => {
  if (!['emitidas', 'recibidas'].includes(tipo)) {
    throw new Error('Tipo DTE inválido; debe ser emitidas o recibidas')
  }
  const rows = await rowsFromFile(file)
  return parseDteRows(rows)
}
