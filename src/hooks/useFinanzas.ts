import * as XLSX from 'xlsx'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import type {
    FacturaEmitida, FacturaRecibida, BoletaHonorario,
    SueldoSocio, CajaChica, MovimientoBancario
} from '../types'

type User = { email?: string } | null

interface ConciliacionMatch {
    tipo: string
    id: string
    descripcion: string
    monto_clp: number
    monto_uf: number
    fecha: string | null
    score: number
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
    sueldosSocios: SueldoSocio[]
    cajaChica: CajaChica[]
    ufActual: number
    loadMovimientosBancarios: () => Promise<void>
    loadCajaChica: () => Promise<void>
    loadFacturasEmitidas: () => Promise<void>
    loadFacturasRecibidas: () => Promise<void>
    loadBoletasHonorarios: () => Promise<void>
    loadSueldosSocios: () => Promise<void>
}

export default function useFinanzas({
    movimientosBancarios, facturasEmitidas, facturasRecibidas,
    boletasHonorarios, sueldosSocios, cajaChica, ufActual,
    loadMovimientosBancarios, loadCajaChica,
    loadFacturasEmitidas, loadFacturasRecibidas, loadBoletasHonorarios, loadSueldosSocios
}: UseFinanzasParams) {
    const uf = Number(ufActual) > 0 ? Number(ufActual) : 38000

    // ─── Parsear cartola Santander ───────────────────────────────────────────
    const parsearCartolaSantander = (arrayBuffer: ArrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        let headerIndex = -1
        for (let i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i][0] === 'MONTO') { headerIndex = i; break }
        }
        if (headerIndex === -1) throw new Error('No se encontró el formato esperado de Santander')

        const hdr = rows[headerIndex]
        let fechaCol = -1, caCol = -1, docCol = -1, sucCol = -1
        for (let c = 0; c < (hdr || []).length; c++) {
            const v = (hdr[c] || '').toString().toUpperCase().trim()
            if (v === 'FECHA') fechaCol = c
            if (v.includes('CARGO') || v.includes('ABONO')) caCol = c
            if (v.includes('DOCUMENTO')) docCol = c
            if (v.includes('SUCURSAL')) sucCol = c
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const movimientos: any[] = []
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row || typeof row[0] !== 'number' || row[0] === 0) continue
            const monto = parseFloat(String(row[0]))
            if (isNaN(monto)) continue

            const tipo = caCol >= 0 && (row[caCol] || '').toString().toUpperCase() === 'A' ? 'entrada' : (monto > 0 ? 'entrada' : 'salida')

            let fecha: string | null = null
            const raw = fechaCol >= 0 ? row[fechaCol] : null
            if (raw) {
                const s = raw.toString().trim()
                const p = s.split('/')
                if (p.length === 3) fecha = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
                else if (s.match(/^\d{4}-\d{2}-\d{2}$/)) fecha = s
            }
            if (!fecha) continue

            const obj: Record<string, unknown> = {
                fecha, descripcion: (row[1] || '').toString().trim(),
                monto_clp: Math.abs(monto), tipo, estado_conciliacion: 'pendiente'
            }
            if (docCol >= 0 && row[docCol]) obj.numero_documento = row[docCol].toString()
            if (sucCol >= 0 && row[sucCol]) obj.sucursal = row[sucCol].toString()
            obj.monto_uf = Math.abs(monto) / uf
            obj.uf_dia = uf
            movimientos.push(obj)
        }
        return movimientos
    }

    const importarCartola = async () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xlsx,.xls'

        input.onchange = async (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return
            try {
                const arrayBuffer = await file.arrayBuffer()
                const movimientos = parsearCartolaSantander(arrayBuffer)
                if (movimientos.length === 0) { showToast('No se encontraron movimientos en la cartola', 'info'); return }

                movimientos.forEach(m => m.archivo_origen = file.name)

                const { data: existentes } = await supabase
                    .from('movimientos_bancarios')
                    .select('fecha, descripcion, monto_clp')

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const movimientosNuevos = movimientos.filter(m => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return !(existentes || []).some((e: any) =>
                        e.fecha === m.fecha && e.descripcion === m.descripcion && Math.abs(e.monto_clp - m.monto_clp) < 1
                    )
                })

                if (movimientosNuevos.length === 0) { showToast('⚠️ Todos los movimientos ya existen en el sistema', 'info'); return }

                const cleanedMovimientos = movimientosNuevos.map(m => {
                    const clean: Record<string, unknown> = {
                        fecha: m.fecha, descripcion: m.descripcion, monto_clp: m.monto_clp,
                        tipo: m.tipo, estado_conciliacion: m.estado_conciliacion || 'pendiente',
                        archivo_origen: m.archivo_origen
                    }
                    if (m.monto_uf) clean.monto_uf = m.monto_uf
                    if (m.uf_dia) clean.uf_dia = m.uf_dia
                    if (m.numero_documento) clean.numero_documento = m.numero_documento
                    if (m.sucursal) clean.sucursal = m.sucursal
                    return clean
                })

                const { error } = await supabase.from('movimientos_bancarios').insert(cleanedMovimientos).select()
                if (error) throw error

                const duplicados = movimientos.length - movimientosNuevos.length
                showToast(`✅ ${movimientosNuevos.length} movimientos importados${duplicados > 0 ? ` (${duplicados} duplicados omitidos)` : ''}`, 'success')
                loadMovimientosBancarios()
            } catch (error) {
                const msg = (error as Error).message || 'Error desconocido'
                if (msg.includes('null value in column')) {
                    showToast('❌ Error: La cartola tiene filas sin fecha válida. Verifica el formato del archivo.', 'error')
                } else if (msg.includes('already exists') || msg.includes('duplicate')) {
                    showToast('⚠️ Algunos movimientos ya existían en el sistema', 'info')
                } else {
                    showToast(`❌ Error al importar: ${msg}`, 'error')
                }
            }
        }
        input.click()
    }

    const buscarMatches = (movimiento: MovimientoBancario): BuscarMatchesResult => {
        const matches: ConciliacionMatch[] = []
        const montoCLP = parseFloat(String(movimiento.monto))
        const fechaMov = new Date(movimiento.fecha ?? '')

        const calcularScore = (fechaRegistro: string | null, montoRegistroCLP: number): number => {
            if (!montoCLP || !montoRegistroCLP || !isFinite(montoCLP) || !isFinite(montoRegistroCLP)) return 0
            const fechaReg = new Date(fechaRegistro ?? '')
            const diffDias = Math.abs((fechaMov.getTime() - fechaReg.getTime()) / (1000 * 60 * 60 * 24))
            const diffMonto = Math.abs(montoCLP - montoRegistroCLP) / montoCLP
            if (!isFinite(diffDias) || !isFinite(diffMonto)) return 0
            if (diffDias > 30 || diffMonto > 0.05) return 0
            let score = 1.0
            score -= (diffDias / 30) * 0.3
            score -= diffMonto * 2
            return Math.max(0, Math.min(1, score))
        }

        if (movimiento.tipo === 'entrada') {
            facturasEmitidas.forEach(f => {
                if (f.estado === 'Cobrada' || f.estado === 'Reclamada') return
                const fAny = f as unknown as Record<string, unknown>
                const fechaFac = String(fAny.fecha_pago || f.fecha_emision || '')
                const montoFacCLP = parseFloat(String(fAny.monto_clp)) || 0
                const score = calcularScore(fechaFac, montoFacCLP)
                if (score > 0.6) matches.push({
                    tipo: 'factura_emitida', id: String(f.id),
                    descripcion: `Factura #${fAny.numero_factura} - ${fAny.cliente}`,
                    monto_clp: montoFacCLP, monto_uf: parseFloat(String(f.monto_uf)) || 0,
                    fecha: fechaFac, score
                })
            })
        }

        if (movimiento.tipo === 'salida') {
            facturasRecibidas.forEach(f => {
                if (f.estado === 'Pagada' || f.estado === 'Reclamada') return
                const fAny = f as unknown as Record<string, unknown>
                const fechaFac = String(fAny.fecha_pago || f.fecha_emision || '')
                const montoFacCLP = parseFloat(String(fAny.monto_clp)) || 0
                const score = calcularScore(fechaFac, montoFacCLP)
                if (score > 0.6) matches.push({
                    tipo: 'factura_recibida', id: String(f.id),
                    descripcion: `Factura #${fAny.numero_factura} - ${fAny.proveedor}`,
                    monto_clp: montoFacCLP, monto_uf: parseFloat(String(f.monto_uf)) || 0,
                    fecha: fechaFac, score
                })
            })

            sueldosSocios.forEach(s => {
                const sAny = s as unknown as Record<string, unknown>
                const montoSueldoCLP = parseFloat(String(sAny.monto_clp)) || 0
                const score = calcularScore(String(sAny.fecha || ''), montoSueldoCLP)
                if (score > 0.6) matches.push({
                    tipo: 'sueldo_socio', id: String(s.id),
                    descripcion: `Retiro ${s.socio} - ${sAny.mes_servicio}`,
                    monto_clp: montoSueldoCLP, monto_uf: parseFloat(String(s.monto_uf)) || 0,
                    fecha: String(sAny.fecha || ''), score
                })
            })

            boletasHonorarios.forEach(b => {
                const bAny = b as unknown as Record<string, unknown>
                const montoBrutoCLP = parseFloat(String(bAny.monto_bruto_clp)) || 0
                const score = calcularScore(String(bAny.fecha || ''), montoBrutoCLP)
                if (score > 0.6) matches.push({
                    tipo: 'boleta_honorario', id: String(b.id),
                    descripcion: `Boleta ${bAny.prestador} - ${bAny.mes_servicio}`,
                    monto_clp: montoBrutoCLP, monto_uf: parseFloat(String(bAny.monto_bruto_uf)) || 0,
                    fecha: String(bAny.fecha || ''), score
                })
            })
        }

        matches.sort((a, b) => b.score - a.score)

        if (movimiento.tipo === 'salida') {
            cajaChica.forEach(c => {
                const cAny = c as unknown as Record<string, unknown>
                const montoCajaCLP = parseFloat(String(cAny.monto_clp)) || 0
                if (!montoCajaCLP || !montoCLP) return
                const diffDias = Math.abs((new Date(movimiento.fecha ?? '').getTime() - new Date(String(c.fecha)).getTime()) / (1000 * 60 * 60 * 24))
                const diffMonto = Math.abs(montoCLP - montoCajaCLP) / montoCLP
                if (diffDias <= 7 && diffMonto <= 0.02) {
                    matches.push({
                        tipo: 'caja_chica', id: String(c.id),
                        descripcion: `Caja Chica: ${cAny.concepto}`,
                        monto_clp: montoCajaCLP, monto_uf: montoCajaCLP / uf,
                        fecha: String(c.fecha), score: 0.85
                    })
                }
            })
            matches.sort((a, b) => b.score - a.score)
        }

        if (movimiento.tipo === 'salida' && (matches.length === 0 || matches[0].score < 0.70)) {
            const desc = (movimiento.descripcion || '').toLowerCase()
            let categoria = 'Otros'
            if (desc.includes('cafe') || desc.includes('restaurant') || desc.includes('comida')) categoria = 'Alimentación'
            else if (desc.includes('uber') || desc.includes('taxi') || desc.includes('transporte')) categoria = 'Transporte'
            else if (desc.includes('google') || desc.includes('microsoft') || desc.includes('software')) categoria = 'Servicios'
            else if (desc.includes('oficina') || desc.includes('materiales')) categoria = 'Materiales'
            return { matches, sugerenciaCategoria: categoria }
        }

        return { matches, sugerenciaCategoria: null }
    }

    const aplicarConciliacion = async (movimientoId: string | number, conciliadoConTipo: string, conciliadoConId: string | number) => {
        try {
            const movId = String(movimientoId)
            const conId = String(conciliadoConId)

            const { data: updMov, error: errorMov } = await supabase
                .from('movimientos_bancarios')
                .update({ estado_conciliacion: 'conciliado', conciliado_con_tipo: conciliadoConTipo, conciliado_con_id: conId, conciliado_at: new Date().toISOString() })
                .eq('id', movId).eq('estado_conciliacion', 'pendiente').select()

            if (errorMov) throw errorMov
            if (!updMov || updMov.length === 0) { showToast('⚠️ Este movimiento ya estaba conciliado', 'info'); return }

            const tablaMap: Record<string, { tabla: string; estado: string }> = {
                factura_emitida:  { tabla: 'facturas_emitidas',   estado: 'Cobrada' },
                factura_recibida: { tabla: 'facturas_recibidas',  estado: 'Pagada'  },
                boleta_honorario: { tabla: 'boletas_honorarios',  estado: 'Pagada'  },
                sueldo_socio:     { tabla: 'sueldos_socios',      estado: 'Pagado'  },
            }

            let tablaActualizada = true
            const entry = tablaMap[conciliadoConTipo]
            if (entry) {
                const { error: errorReg } = await supabase.from(entry.tabla).update({ estado: entry.estado }).eq('id', conId)
                if (errorReg) { tablaActualizada = false; console.warn(`Could not update ${entry.tabla}:`, errorReg.message) }
            }

            if (tablaActualizada) showToast('✅ Conciliación aplicada correctamente', 'success')
            else showToast(`⚠️ Movimiento conciliado, pero no se pudo actualizar ${entry?.tabla}. Refresca y revisa.`, 'warning')

            await Promise.all([
                loadMovimientosBancarios?.(),
                loadFacturasEmitidas?.(),
                loadFacturasRecibidas?.(),
                loadBoletasHonorarios?.(),
                loadSueldosSocios?.()
            ])
        } catch (error) {
            showToast(`❌ Error: ${(error as Error).message}`, 'error')
        }
    }

    const crearGastoCajaChica = async (movimiento: MovimientoBancario, categoria: string) => {
        try {
            const mAny = movimiento as unknown as Record<string, unknown>
            const montoCLPGasto = Number(mAny.monto_clp) || 0
            const nuevoGasto = {
                fecha: movimiento.fecha, concepto: movimiento.descripcion,
                monto_clp: montoCLPGasto, monto_uf: uf > 0 ? montoCLPGasto / uf : null,
                uf_dia: uf, categoria, responsable: 'Importado desde cartola',
                comprobante: mAny.numero_documento
            }
            const { data, error } = await supabase.from('caja_chica').insert([nuevoGasto]).select()
            if (error) throw error
            await aplicarConciliacion(String(movimiento.id), 'caja_chica', String((data as Record<string, unknown>[])[0].id))
            loadCajaChica()
        } catch (error) {
            showToast(`❌ Error: ${(error as Error).message}`, 'error')
        }
    }

    const ignorarMovimiento = async (movimientoId: string) => {
        try {
            const { error } = await supabase.from('movimientos_bancarios').update({ estado_conciliacion: 'ignorar' }).eq('id', String(movimientoId))
            if (error) throw error
            showToast('Movimiento ignorado', 'info')
            loadMovimientosBancarios()
        } catch (error) {
            showToast('Error al ignorar movimiento', 'error')
            console.error(error)
        }
    }

    return { importarCartola, buscarMatches, aplicarConciliacion, crearGastoCajaChica, ignorarMovimiento }
}
