import * as XLSX from 'xlsx'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import type {
    FacturaEmitida, FacturaRecibida, BoletaHonorario,
    SueldoSocio, CajaChica, MovimientoBancario, Liquidacion
} from '../types'

type User = { email?: string } | null

// ─────────────────────────────────────────────────────────────────────────────
// TEXT MATCHING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Palabras que no aportan al matching (comunes en descripciones bancarias y docs)
const STOP_WORDS = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'en', 'con', 'por', 'para', 'y', 'a',
    'transf', 'transferencia', 'pago', 'cargo', 'abono', 'compra', 'web', 'ltda',
    'spa', 'eirl', 's.a', 'sa', 'srl', 'cia', 'the', 'and', 'via', 'pvto',
])

function normalizeText(s: string): string[] {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // quitar tildes
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
}

/**
 * Similitud de Jaccard entre dos strings (tokens comunes / tokens totales).
 * Retorna valor 0–1.
 */
function tokenSimilarity(a: string, b: string): number {
    const ta = new Set(normalizeText(a))
    const tb = new Set(normalizeText(b))
    if (ta.size === 0 || tb.size === 0) return 0
    let intersection = 0
    ta.forEach(t => { if (tb.has(t)) intersection++ })
    const union = ta.size + tb.size - intersection
    return union === 0 ? 0 : intersection / union
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score de monto: 1.0 si es idéntico, 0 si la diferencia supera `tolerance`.
 * tolerance=0.15 por defecto (15%).
 * Bonus: si la diferencia es < 0.5%, retorna 1.0 independiente de la tolerancia.
 */
function scoreAmount(montoCLP: number, montoDoc: number, tolerance = 0.15): number {
    if (!montoCLP || !montoDoc || !isFinite(montoCLP) || !isFinite(montoDoc)) return 0
    const diff = Math.abs(montoCLP - montoDoc) / Math.max(montoCLP, montoDoc)
    if (diff < 0.005) return 1.0  // monto prácticamente idéntico → score perfecto
    if (diff > tolerance) return 0
    return 1 - diff / tolerance
}

/**
 * Score de fecha: 1.0 si coincide, decae linealmente hasta 0 en `maxDays`.
 * Si el doc no tiene fecha, retorna 0.3 (neutro).
 */
function scoreDate(fechaMov: Date, fechaDoc: string | null | undefined, maxDays = 45): number {
    if (!fechaDoc) return 0.3
    const raw = String(fechaDoc).slice(0, 10)
    const d = new Date(raw + 'T00:00:00')
    if (isNaN(d.getTime())) return 0.3
    const diffDias = Math.abs((fechaMov.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDias > maxDays) return 0
    return 1 - diffDias / maxDays
}

/**
 * Score compuesto: monto 55%, fecha 30%, texto 15%.
 * Si monto es 0 → score total = 0 (monto es obligatorio).
 * Si hay buen match de texto (≥0.3), se amplifica su peso a 25% para
 * diferenciar mejor candidatos con montos similares.
 */
function compositeScore(sAmt: number, sDate: number, sText: number): number {
    if (sAmt === 0) return 0
    if (sText >= 0.30) {
        // Texto significativo → pesos: monto 50%, fecha 25%, texto 25%
        return sAmt * 0.50 + sDate * 0.25 + sText * 0.25
    }
    return sAmt * 0.55 + sDate * 0.30 + sText * 0.15
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS CAJA CHICA
// ─────────────────────────────────────────────────────────────────────────────

function detectarCategoria(descripcion: string): string {
    const d = descripcion.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

    if (/cafe|restaurant|sushi|pizza|almuerzo|comida|food|delivery|rappi|ubereats|pedidosya|junaeb|colacion|desayuno|cena/.test(d))
        return 'Alimentación'
    if (/uber|taxi|cabify|transporte|bus|metro|bip|parking|estacionamiento|peaje|didi|indriver/.test(d))
        return 'Transporte'
    if (/google|microsoft|slack|zoom|notion|adobe|figma|gsuite|workspace|dropbox|openai|chatgpt|capcut|canva|software|suscripcion|netflix|spotify/.test(d))
        return 'Software / Suscripciones'
    if (/hosting|dominio|aws|digitalocean|cloudflare|heroku|servidor|cloud|vps/.test(d))
        return 'Infraestructura'
    if (/oficina|materiales|impresion|papel|utiles|articulos|escritorio|toner|cartucho/.test(d))
        return 'Materiales de Oficina'
    if (/telefon|celular|internet|cable|movistar|entel|claro|wom|vtr|fibra|plan/.test(d))
        return 'Telecomunicaciones'
    if (/hotel|hospedaje|airbnb|booking|viaje|vuelo|avion|aeropuerto|latam|sky/.test(d))
        return 'Viajes'
    if (/honorarios|boleta|prestacion|prestador|consultor/.test(d))
        return 'Honorarios'
    if (/remuneracion|sueldo|liquidacion|prevision|afp|isapre/.test(d))
        return 'Remuneraciones'
    if (/impuesto|sii|iva|ppua|retenci|tesoreria/.test(d))
        return 'Impuestos'
    if (/publicidad|marketing|redes|instagram|facebook|pauta|anuncio|campana/.test(d))
        return 'Marketing'
    if (/notaria|abogado|legal|escritura|registro|contrat/.test(d))
        return 'Legal / Notaría'
    if (/banco|comision|mantenci|cargo mensual|iva com/.test(d))
        return 'Comisiones Bancarias'

    return 'Otros'
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSERS DE CARTOLA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un valor de celda Excel a fecha ISO "YYYY-MM-DD".
 * Acepta:
 *   - String DD/MM/YYYY  (formato Santander Chile)
 *   - String YYYY-MM-DD  (ISO)
 *   - Número serial Excel (e.g. 45139 = 2023-08-13)
 */
function parseExcelDate(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null
    const s = String(raw).trim()
    if (!s) return null

    // ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

    // DD/MM/YYYY (Chile)
    const p = s.split('/')
    if (p.length === 3 && p[2].length === 4) {
        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
    }

    // Serial Excel (números entre ~40000 y ~55000 cubren 2010-2050)
    const n = parseFloat(s)
    if (!isNaN(n) && n > 40000 && n < 55000) {
        const date = new Date((n - 25569) * 86400 * 1000)
        if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10)
    }

    return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsearCartolaSantander(arrayBuffer: ArrayBuffer, uf: number): any[] {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    // Buscar fila de encabezados (primera celda = 'MONTO')
    let headerIndex = -1
    for (let i = 0; i < rows.length; i++) {
        const cell = (rows[i]?.[0] ?? '').toString().toUpperCase().trim()
        if (cell === 'MONTO') { headerIndex = i; break }
    }
    if (headerIndex === -1) throw new Error('No se encontró el formato esperado. ¿Es una cartola Santander Empresas?')

    const hdr = rows[headerIndex]
    let fechaCol = -1, descCol = 1, caCol = -1, docCol = -1, sucCol = -1

    for (let c = 0; c < (hdr || []).length; c++) {
        const v = (hdr[c] ?? '').toString().toUpperCase().trim()
        if (v === 'FECHA') fechaCol = c
        if (v.includes('DESCRIPCI')) descCol = c
        if (v.includes('CARGO') || v.includes('ABONO')) caCol = c
        if (v.includes('DOCUMENTO') || v.includes('N°')) docCol = c
        if (v.includes('SUCURSAL')) sucCol = c
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movimientos: any[] = []

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue

        // La columna 0 (MONTO) debe ser un número distinto de 0
        const rawMonto = row[0]
        if (typeof rawMonto !== 'number' || rawMonto === 0) continue
        const monto = rawMonto

        // Fecha
        const rawFecha = fechaCol >= 0 ? row[fechaCol] : null
        const fecha = parseExcelDate(rawFecha)
        if (!fecha) continue

        // Descripción
        const descripcion = String(row[descCol] ?? '').trim()

        // Tipo: 'A' = Abono = entrada, 'C' = Cargo = salida
        const caStr = caCol >= 0 ? (row[caCol] ?? '').toString().toUpperCase().trim() : ''
        const tipo: 'entrada' | 'salida' = caStr === 'A' ? 'entrada' : (monto > 0 ? 'entrada' : 'salida')

        const monto_clp = Math.abs(monto)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: Record<string, any> = {
            fecha,
            descripcion,
            monto_clp,
            tipo,
            estado_conciliacion: 'pendiente',
            monto_uf: monto_clp / uf,
            uf_dia: uf,
        }

        const docVal = docCol >= 0 ? row[docCol] : null
        if (docVal && String(docVal) !== '0') obj.numero_documento = String(docVal)

        const sucVal = sucCol >= 0 ? row[sucCol] : null
        if (sucVal) obj.sucursal = String(sucVal).trim()

        movimientos.push(obj)
    }

    return movimientos
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface ConciliacionMatch {
    tipo: string
    id: string
    descripcion: string
    monto_clp: number
    monto_uf: number
    fecha: string | null
    score: number
    detalle?: string  // info adicional (e.g. "Match por monto líquido")
}

interface BuscarMatchesResult {
    matches: ConciliacionMatch[]
    sugerenciaCategoria: string | null
}

interface UseFinanzasParams {
    user: User
    movimientosBancarios: MovimientoBancario[]
    setMovimientosBancarios: (data: MovimientoBancario[]) => void
    facturasEmitidas: FacturaEmitida[]
    facturasRecibidas: FacturaRecibida[]
    boletasHonorarios: BoletaHonorario[]
    liquidaciones: Liquidacion[]
    sueldosSocios: SueldoSocio[]
    cajaChica: CajaChica[]
    ufActual: number
    loadMovimientosBancarios: () => Promise<void>
    loadCajaChica: () => Promise<void>
    loadFacturasEmitidas: () => Promise<void>
    loadFacturasRecibidas: () => Promise<void>
    loadBoletasHonorarios: () => Promise<void>
    loadSueldosSocios: () => Promise<void>
    loadLiquidaciones: () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function useFinanzas({
    movimientosBancarios, facturasEmitidas, facturasRecibidas,
    boletasHonorarios, liquidaciones, sueldosSocios, cajaChica, ufActual,
    loadMovimientosBancarios, loadCajaChica,
    loadFacturasEmitidas, loadFacturasRecibidas, loadBoletasHonorarios, loadSueldosSocios, loadLiquidaciones
}: UseFinanzasParams) {
    const uf = Number(ufActual) > 0 ? Number(ufActual) : 38000

    // ─── Importar cartola bancaria ──────────────────────────────────────────

    const importarCartola = async () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xlsx,.xls'

        input.onchange = async (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return
            try {
                const arrayBuffer = await file.arrayBuffer()
                const movimientos = parsearCartolaSantander(arrayBuffer, uf)
                if (movimientos.length === 0) {
                    showToast('No se encontraron movimientos en la cartola', 'info')
                    return
                }

                movimientos.forEach(m => { m.archivo_origen = file.name })

                // Deduplicación nivel 1: ¿ya se importó este mismo archivo?
                const { data: existentesPorArchivo } = await supabase
                    .from('movimientos_bancarios')
                    .select('id')
                    .eq('archivo_origen', file.name)
                    .limit(1)

                if (existentesPorArchivo && existentesPorArchivo.length > 0) {
                    showToast(`⚠️ Este archivo ya fue importado anteriormente (${file.name}). Si quieres reimportar, primero usa "Limpiar Todo".`, 'warning')
                    return
                }

                // Deduplicación nivel 2: comparar fecha + descripción (normalizada) + monto
                const { data: existentes } = await supabase
                    .from('movimientos_bancarios')
                    .select('fecha, descripcion, monto_clp')

                const normDesc = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const movimientosNuevos = movimientos.filter((m: any) =>
                    !(existentes ?? []).some((e: Record<string, unknown>) =>
                        e.fecha === m.fecha &&
                        normDesc(String(e.descripcion ?? '')) === normDesc(String(m.descripcion ?? '')) &&
                        Math.abs(Number(e.monto_clp) - m.monto_clp) < 1
                    )
                )

                if (movimientosNuevos.length === 0) {
                    showToast('⚠️ Todos los movimientos ya existen en el sistema', 'info')
                    return
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cleanedMovimientos = movimientosNuevos.map((m: any) => {
                    const clean: Record<string, unknown> = {
                        fecha: m.fecha,
                        descripcion: m.descripcion,
                        monto_clp: m.monto_clp,
                        tipo: m.tipo,
                        estado_conciliacion: 'pendiente',
                        archivo_origen: m.archivo_origen,
                        monto_uf: m.monto_uf,
                        uf_dia: m.uf_dia,
                    }
                    if (m.numero_documento) clean.numero_documento = m.numero_documento
                    if (m.sucursal) clean.sucursal = m.sucursal
                    return clean
                })

                const { error } = await supabase.from('movimientos_bancarios').insert(cleanedMovimientos).select()
                if (error) throw error

                const duplicados = movimientos.length - movimientosNuevos.length
                showToast(
                    `✅ ${movimientosNuevos.length} movimientos importados` +
                    (duplicados > 0 ? ` (${duplicados} duplicados omitidos)` : ''),
                    'success'
                )
                loadMovimientosBancarios()
            } catch (error) {
                const msg = (error as Error).message || 'Error desconocido'
                if (msg.includes('null value in column')) {
                    showToast('❌ Error: La cartola tiene filas sin fecha válida. Verifica el formato.', 'error')
                } else if (msg.includes('already exists') || msg.includes('duplicate')) {
                    showToast('⚠️ Algunos movimientos ya existían en el sistema', 'info')
                } else {
                    showToast(`❌ Error al importar: ${msg}`, 'error')
                }
            }
        }
        input.click()
    }

    // ─── Buscar matches para conciliación ──────────────────────────────────

    const buscarMatches = (movimiento: MovimientoBancario): BuscarMatchesResult => {
        // FIX: usar monto_clp (campo real del DB) en lugar de monto (tipo TS incorrecto)
        const movAny = movimiento as unknown as Record<string, unknown>
        const montoCLP = parseFloat(String(movAny.monto_clp ?? movimiento.monto ?? 0))
        if (!montoCLP || !isFinite(montoCLP)) return { matches: [], sugerenciaCategoria: null }

        // Pre-calcular IDs ya usados en conciliaciones existentes para no sugerir el mismo doc
        // para múltiples movimientos al mismo tiempo.
        const yaUsados = new Set<string>()
        movimientosBancarios.forEach(m => {
            const mAny = m as unknown as Record<string, unknown>
            if (mAny.estado_conciliacion === 'conciliado' && mAny.conciliado_con_tipo && mAny.conciliado_con_id) {
                yaUsados.add(`${mAny.conciliado_con_tipo}:${mAny.conciliado_con_id}`)
            }
        })

        const tipoStr = String(movAny.tipo || movimiento.tipo || '').toLowerCase()
        const esEntrada = tipoStr === 'entrada' || tipoStr === 'abono'
        const esSalida  = tipoStr === 'salida'  || tipoStr === 'cargo'
        const descMov   = String(movimiento.descripcion || movAny.descripcion || '')
        const fechaMov  = new Date((String(movimiento.fecha || movAny.fecha || '')).slice(0, 10) + 'T00:00:00')

        const matches: ConciliacionMatch[] = []

        // ── Entradas → Facturas Emitidas ──────────────────────────────────
        if (esEntrada) {
            facturasEmitidas.forEach(f => {
                const fAny = f as unknown as Record<string, unknown>
                if (['Reclamada', 'Cobrada'].includes(String(fAny.estado || f.estado))) return
                if (yaUsados.has(`factura_emitida:${f.id}`)) return

                const montoFac = parseFloat(String(fAny.monto_clp ?? fAny.monto_total ?? 0))
                const fechaDoc = String(fAny.fecha_pago || f.fecha_emision || fAny.fecha_emision || '')
                const descDoc  = [fAny.cliente, fAny.razon_social_receptor, fAny.numero_factura, fAny.folio, f.descripcion].filter(Boolean).join(' ')

                const sAmt  = scoreAmount(montoCLP, montoFac)
                const sDate = scoreDate(fechaMov, fechaDoc)
                const sText = tokenSimilarity(descMov, descDoc)
                const score = compositeScore(sAmt, sDate, sText)

                if (score >= 0.35) {
                    const numFacEmi = fAny.numero_factura ?? fAny.folio
                    matches.push({
                        tipo: 'factura_emitida',
                        id: String(f.id),
                        descripcion: `Factura ${numFacEmi ? `#${numFacEmi}` : '(sin N°)'} — ${fAny.cliente ?? fAny.razon_social_receptor ?? '(sin cliente)'}`,
                        monto_clp: montoFac,
                        monto_uf: parseFloat(String(f.monto_uf || 0)),
                        fecha: fechaDoc || null,
                        score,
                    })
                }
            })
        }

        // ── Salidas → Facturas Recibidas ──────────────────────────────────
        if (esSalida) {
            facturasRecibidas.forEach(f => {
                const fAny = f as unknown as Record<string, unknown>
                if (['Pagada', 'Reclamada'].includes(String(fAny.estado || f.estado))) return
                if (yaUsados.has(`factura_recibida:${f.id}`)) return

                const montoFac = parseFloat(String(fAny.monto_clp ?? fAny.monto_total ?? 0))
                const fechaDoc = String(fAny.fecha_pago || f.fecha_emision || fAny.fecha_emision || '')
                const descDoc  = [fAny.proveedor, fAny.razon_social_proveedor, fAny.rut_proveedor, fAny.numero_factura, fAny.folio, fAny.categoria, f.descripcion].filter(Boolean).join(' ')

                // IVA-aware: el banco puede haber pagado con o sin IVA incluido (19%)
                const sAmt  = Math.max(scoreAmount(montoCLP, montoFac), scoreAmount(montoCLP, montoFac * 1.19))
                const sDate = scoreDate(fechaMov, fechaDoc)
                const sText = tokenSimilarity(descMov, descDoc)
                const score = compositeScore(sAmt, sDate, sText)

                if (score >= 0.35) {
                    const numFacRec = fAny.numero_factura ?? fAny.folio
                    matches.push({
                        tipo: 'factura_recibida',
                        id: String(f.id),
                        descripcion: `Factura ${numFacRec ? `#${numFacRec}` : '(sin N°)'} — ${fAny.proveedor ?? fAny.razon_social_proveedor ?? '(sin proveedor)'}`,
                        monto_clp: montoFac,
                        monto_uf: parseFloat(String(f.monto_uf || 0)),
                        fecha: fechaDoc || null,
                        score,
                    })
                }
            })

            // ── Salidas → Retiros Socios ──────────────────────────────────
            sueldosSocios.forEach(s => {
                const sAny = s as unknown as Record<string, unknown>
                if (yaUsados.has(`sueldo_socio:${s.id}`)) return
                const montoCLPSocio = parseFloat(String(sAny.monto_clp ?? sAny.monto_liquido ?? s.monto_liquido ?? 0))
                const fechaDoc      = String(sAny.fecha || sAny.fecha_pago || s.fecha_pago || '')
                const descDoc       = [s.socio, sAny.mes_servicio, sAny.mes, s.mes, sAny.concepto].filter(Boolean).join(' ')

                const sAmt  = scoreAmount(montoCLP, montoCLPSocio)
                const sDate = scoreDate(fechaMov, fechaDoc)
                const sText = tokenSimilarity(descMov, descDoc)
                const score = compositeScore(sAmt, sDate, sText)

                if (score >= 0.35) {
                    matches.push({
                        tipo: 'sueldo_socio',
                        id: String(s.id),
                        descripcion: `Retiro ${s.socio} — ${sAny.mes_servicio ?? sAny.mes ?? s.mes}`,
                        monto_clp: montoCLPSocio,
                        monto_uf: parseFloat(String(s.monto_uf || 0)),
                        fecha: fechaDoc || null,
                        score,
                    })
                }
            })

            // ── Salidas → Boletas de Honorarios ──────────────────────────
            // Importante: el banco paga el monto LÍQUIDO (neto de retención),
            // pero también intentamos con bruto por si el pago fue sin retención.
            boletasHonorarios.forEach(b => {
                const bAny = b as unknown as Record<string, unknown>
                if (yaUsados.has(`boleta_honorario:${b.id}`)) return
                const montoBruto   = parseFloat(String(bAny.monto_bruto_clp ?? bAny.monto_bruto ?? b.monto_bruto ?? 0))
                const montoLiquido = parseFloat(String(bAny.monto_liquido_clp ?? bAny.monto_liquido ?? b.monto_liquido ?? 0))
                const fechaDoc     = String(bAny.fecha || b.fecha_emision || bAny.fecha_emision || '')
                const descDoc      = [bAny.prestador, bAny.nombre_emisor, b.nombre_emisor, bAny.mes_servicio, b.descripcion].filter(Boolean).join(' ')

                // Intentar match con monto líquido (el más común en transferencias)
                const sAmtL  = scoreAmount(montoCLP, montoLiquido, 0.10)
                const sAmtB  = scoreAmount(montoCLP, montoBruto, 0.10)
                const sDate  = scoreDate(fechaMov, fechaDoc)
                const sText  = tokenSimilarity(descMov, descDoc)

                const scoreLiquido = compositeScore(sAmtL, sDate, sText)
                const scoreBruto   = compositeScore(sAmtB, sDate, sText)
                const bestScore    = Math.max(scoreLiquido, scoreBruto)
                const esLiquido    = scoreLiquido >= scoreBruto

                if (bestScore >= 0.35) {
                    matches.push({
                        tipo: 'boleta_honorario',
                        id: String(b.id),
                        descripcion: `Boleta ${bAny.prestador ?? bAny.nombre_emisor ?? ''} — ${bAny.mes_servicio ?? ''}`,
                        monto_clp: esLiquido ? montoLiquido : montoBruto,
                        monto_uf: parseFloat(String(bAny.monto_bruto_uf ?? bAny.monto_uf ?? b.monto_uf ?? 0)),
                        fecha: fechaDoc || null,
                        score: bestScore,
                        detalle: esLiquido ? 'Match por monto líquido (neto retención)' : 'Match por monto bruto',
                    })
                }
            })

            // ── Salidas → Liquidaciones de Sueldo ───────────────────────
            liquidaciones.forEach(l => {
                const lAny = l as unknown as Record<string, unknown>
                if (yaUsados.has(`liquidacion:${l.id}`)) return
                // Matchear por líquido a pagar (lo que sale del banco)
                const montoLiquido = parseFloat(String(lAny.liquido_pagar ?? 0))
                const fechaDoc     = String(lAny.periodo || '')
                const descDoc      = [lAny.trabajador, 'sueldo', 'remuneracion', 'liquidacion'].filter(Boolean).join(' ')

                const sAmt  = scoreAmount(montoCLP, montoLiquido, 0.10)
                const sDate = scoreDate(fechaMov, fechaDoc, 35) // ventana amplia: el pago puede ser días después
                const sText = tokenSimilarity(descMov, descDoc)
                const score = compositeScore(sAmt, sDate, sText)

                if (score >= 0.35) {
                    matches.push({
                        tipo: 'liquidacion',
                        id: String(l.id),
                        descripcion: `Liquidación ${lAny.trabajador ?? ''} — ${lAny.periodo ?? ''}`,
                        monto_clp: montoLiquido,
                        monto_uf: parseFloat(String(lAny.monto_uf ?? 0)),
                        fecha: fechaDoc || null,
                        score,
                        detalle: 'Match por líquido a pagar',
                    })
                }
            })

            // ── Salidas → Caja Chica ya registrada ───────────────────────
            cajaChica.forEach(c => {
                const cAny = c as unknown as Record<string, unknown>
                if (yaUsados.has(`caja_chica:${c.id}`)) return
                const montoCajaChica = parseFloat(String(cAny.monto_clp ?? c.monto ?? 0))
                const fechaDoc       = String(c.fecha || cAny.fecha || '')
                const descDoc        = [cAny.concepto, c.descripcion, cAny.categoria, c.categoria].filter(Boolean).join(' ')

                const sAmt  = scoreAmount(montoCLP, montoCajaChica, 0.05) // más estricto para caja
                const sDate = scoreDate(fechaMov, fechaDoc, 10)           // ventana de 10 días
                const sText = tokenSimilarity(descMov, descDoc)
                const score = compositeScore(sAmt, sDate, sText)

                if (score >= 0.50) {
                    matches.push({
                        tipo: 'caja_chica',
                        id: String(c.id),
                        descripcion: `Gasto Menor: ${cAny.concepto ?? c.descripcion ?? ''}`,
                        monto_clp: montoCajaChica,
                        monto_uf: montoCajaChica / uf,
                        fecha: fechaDoc || null,
                        score,
                    })
                }
            })
        }

        // Ordenar por score descendente
        matches.sort((a, b) => b.score - a.score)

        // Sugerir categoría Caja Chica si no hay buen match
        const mejorScore = matches[0]?.score ?? 0
        if (esSalida && mejorScore < 0.60) {
            const categoria = detectarCategoria(descMov)
            return { matches, sugerenciaCategoria: categoria }
        }

        return { matches, sugerenciaCategoria: null }
    }

    // ─── Aplicar conciliación ───────────────────────────────────────────────

    const aplicarConciliacion = async (
        movimientoId: string | number,
        conciliadoConTipo: string,
        conciliadoConId: string | number
    ) => {
        try {
            const movId = String(movimientoId)
            const conId = String(conciliadoConId)

            const { data: updMov, error: errorMov } = await supabase
                .from('movimientos_bancarios')
                .update({
                    estado_conciliacion: 'conciliado',
                    conciliado_con_tipo: conciliadoConTipo,
                    conciliado_con_id: conId,
                    conciliado_at: new Date().toISOString(),
                })
                .eq('id', movId)
                .eq('estado_conciliacion', 'pendiente')
                .select()

            if (errorMov) throw errorMov
            if (!updMov || updMov.length === 0) {
                showToast('⚠️ Este movimiento ya estaba conciliado', 'info')
                return
            }

            const tablaMap: Record<string, { tabla: string; estado: string }> = {
                factura_emitida:  { tabla: 'facturas_emitidas',  estado: 'Cobrada' },
                factura_recibida: { tabla: 'facturas_recibidas', estado: 'Pagada'  },
                boleta_honorario: { tabla: 'boletas_honorarios', estado: 'Pagada'  },
                liquidacion:      { tabla: 'liquidaciones',      estado: 'Pagada'  },
                sueldo_socio:     { tabla: 'sueldos_socios',     estado: 'Pagado'  },
            }

            const entry = tablaMap[conciliadoConTipo]
            if (entry) {
                const { error: errorReg } = await supabase
                    .from(entry.tabla)
                    .update({ estado: entry.estado })
                    .eq('id', conId)
                if (errorReg) {
                    console.warn(`No se pudo actualizar ${entry.tabla}:`, errorReg.message)
                    showToast(`⚠️ Movimiento conciliado, pero no se pudo actualizar ${entry.tabla}.`, 'warning')
                } else {
                    showToast('✅ Conciliación aplicada correctamente', 'success')
                }
            } else {
                // caja_chica u otro tipo sin tabla asociada
                showToast('✅ Conciliación aplicada', 'success')
            }

            await Promise.all([
                loadMovimientosBancarios(),
                loadFacturasEmitidas(),
                loadFacturasRecibidas(),
                loadBoletasHonorarios(),
                loadSueldosSocios(),
                loadLiquidaciones(),
            ])
        } catch (error) {
            showToast(`❌ Error: ${(error as Error).message}`, 'error')
        }
    }

    // ─── Crear gasto Caja Chica desde movimiento bancario ─────────────────

    const crearGastoCajaChica = async (movimiento: MovimientoBancario, categoria?: string) => {
        try {
            const movAny = movimiento as unknown as Record<string, unknown>
            const montoCLPGasto = Number(movAny.monto_clp ?? movimiento.monto ?? 0)
            const descMov       = String(movimiento.descripcion ?? movAny.descripcion ?? '')
            const categoriaFinal = categoria || detectarCategoria(descMov)

            const nuevoGasto = {
                fecha:        movimiento.fecha,
                concepto:     descMov,
                monto_clp:    montoCLPGasto,
                monto_uf:     uf > 0 ? montoCLPGasto / uf : null,
                uf_dia:       uf,
                categoria:    categoriaFinal,
                responsable:  'Importado desde cartola',
                comprobante:  movAny.numero_documento ?? null,
            }

            const { data, error } = await supabase.from('caja_chica').insert([nuevoGasto]).select()
            if (error) throw error

            const newId = (data as Record<string, unknown>[])[0].id
            await aplicarConciliacion(String(movimiento.id), 'caja_chica', String(newId))
            loadCajaChica()
        } catch (error) {
            showToast(`❌ Error: ${(error as Error).message}`, 'error')
        }
    }

    // ─── Ignorar movimiento ─────────────────────────────────────────────────

    const ignorarMovimiento = async (movimientoId: string) => {
        try {
            const { error } = await supabase
                .from('movimientos_bancarios')
                .update({ estado_conciliacion: 'ignorar' })
                .eq('id', String(movimientoId))
            if (error) throw error
            showToast('Movimiento ignorado', 'info')
            loadMovimientosBancarios()
        } catch (error) {
            showToast('Error al ignorar movimiento', 'error')
            console.error(error)
        }
    }

    return {
        importarCartola,
        buscarMatches,
        aplicarConciliacion,
        crearGastoCajaChica,
        ignorarMovimiento,
        detectarCategoria,  // exportar para uso externo si se necesita
    }
}
