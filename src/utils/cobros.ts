// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE COBRO — lógica pura (sin Supabase ni React), testeable con Vitest.
//
// Un Ticket o Key Account tiene (idealmente) un plan de cobro con N cuotas.
// La cuota se considera:
//   - Omitida    → se acordó no cobrarla
//   - Por facturar / Atrasada / Programada → sin factura vinculada
//   - Facturada  → tiene factura emitida pendiente de pago
//   - Pagada     → su factura está Cobrada/Pagada (conciliación bancaria)
// ─────────────────────────────────────────────────────────────────────────────

import { emitidaEstaCobrada } from './conciliacion'

export type EntidadCobro = 'ticket' | 'key_account'
export type ModalidadCobro = 'mensual' | 'hitos'
export type ReglaUF = 'congelada' | 'dia_emision'

export interface PlanCobro {
    id?: string
    entidad_tipo: EntidadCobro
    entidad_id: string
    organizacion: string | null
    servicio: string | null
    modalidad: ModalidadCobro
    moneda: 'UF' | 'CLP'
    regla_uf: ReglaUF
    uf_pactada: number | null
    fecha_uf_pactada: string | null
    dia_facturacion: number | null
    estado: 'activo' | 'finalizado' | 'cancelado'
    documento_url: string | null
    notas: string | null
    created_at?: string
    deleted_at?: string | null
}

export interface CuotaCobro {
    id?: string
    plan_id?: string
    numero: number
    fecha_programada: string      // 'YYYY-MM-DD'
    glosa: string | null
    monto: number                 // en la moneda del plan
    factura_id: string | null
    omitida: boolean
    notas?: string | null
}

export interface FacturaLite {
    id: string | number
    folio?: string | null
    numero_factura?: string | null
    estado?: string | null
    fecha_emision?: string | null
    fecha_pago?: string | null
    cliente?: string | null
    total_monto_clp?: number | null
    monto_clp?: number | null
    monto_uf?: number | null
    uf_dia?: number | null
    crm_ticket_id?: string | null
    crm_ka_id?: string | null
}

export type EstadoCuota = 'omitida' | 'programada' | 'por_facturar' | 'atrasada' | 'facturada' | 'pagada'

export const ESTADO_CUOTA_LABEL: Record<EstadoCuota, string> = {
    omitida: 'Omitida',
    programada: 'Programada',
    por_facturar: 'Por facturar',
    atrasada: 'Atrasada',
    facturada: 'Facturada',
    pagada: 'Pagada',
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYMD(s: string): Date | null {
    const m = String(s ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** Fecha en el mes (año, mes0) ajustando el día al último día del mes si no existe (31 → 30/28). */
function fechaEnMes(anio: number, mes0: number, dia: number): string {
    const ultimo = new Date(anio, mes0 + 1, 0).getDate()
    return ymd(new Date(anio, mes0, Math.min(Math.max(1, dia), ultimo)))
}

/**
 * Cantidad de meses de un contrato entre inicio y fin (inclusive por mes calendario).
 * 2026-01-15 → 2026-12-14 = 12 · 2026-03-01 → 2026-03-31 = 1
 */
export function mesesEntre(inicio: string, fin: string): number {
    const a = parseYMD(inicio), b = parseYMD(fin)
    if (!a || !b || b < a) return 0
    let meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    // Si el día de término es >= al día de inicio - 1, cuenta el mes parcial completo
    if (b.getDate() >= a.getDate() - 1) meses += 1
    return Math.max(1, meses)
}

/** Genera N cuotas mensuales iguales a partir de la fecha de la primera. */
export function generarCuotasMensuales({ primeraFecha, nCuotas, monto, diaFacturacion, servicio }: {
    primeraFecha: string; nCuotas: number; monto: number; diaFacturacion?: number | null; servicio?: string | null
}): CuotaCobro[] {
    const inicio = parseYMD(primeraFecha)
    if (!inicio || !(nCuotas > 0)) return []
    const dia = diaFacturacion && diaFacturacion > 0 ? diaFacturacion : inicio.getDate()
    const out: CuotaCobro[] = []
    for (let i = 0; i < Math.min(nCuotas, 120); i++) {
        const anio = inicio.getFullYear() + Math.floor((inicio.getMonth() + i) / 12)
        const mes0 = (inicio.getMonth() + i) % 12
        out.push({
            numero: i + 1,
            fecha_programada: fechaEnMes(anio, mes0, dia),
            glosa: `${servicio ? servicio + ' — ' : ''}cuota ${i + 1}/${nCuotas} (${MESES[mes0]} ${anio})`,
            monto,
            factura_id: null,
            omitida: false,
        })
    }
    return out
}

/** Estado de una cuota cruzando con su factura (si la tiene) y la fecha de hoy. */
export function estadoCuota(c: CuotaCobro, factura: FacturaLite | undefined, hoy: string): EstadoCuota {
    if (c.omitida) return 'omitida'
    if (c.factura_id) {
        if (factura && emitidaEstaCobrada(factura.estado)) return 'pagada'
        return 'facturada'
    }
    const f = String(c.fecha_programada).slice(0, 10)
    if (f < hoy.slice(0, 8) + '01') return 'atrasada'            // mes anterior o antes
    if (f.slice(0, 7) === hoy.slice(0, 7)) return 'por_facturar'  // este mes
    return 'programada'
}

/**
 * UF a usar para facturar una cuota en UF:
 *  - plan 'congelada' con uf_pactada → esa UF (práctica THO: la del cierre/firma)
 *  - si no → UF del día (la que se use al emitir; acá, la de hoy como estimación)
 */
export function ufParaCuota(plan: Pick<PlanCobro, 'moneda' | 'regla_uf' | 'uf_pactada'>, ufHoy: number): { uf: number; estimada: boolean } {
    if (plan.moneda !== 'UF') return { uf: 0, estimada: false }
    if (plan.regla_uf === 'congelada' && plan.uf_pactada && plan.uf_pactada > 0) return { uf: Number(plan.uf_pactada), estimada: false }
    return { uf: ufHoy, estimada: true }
}

/** Monto CLP a facturar para una cuota (exenta: sin IVA). */
export function montoCLPCuota(c: Pick<CuotaCobro, 'monto'>, plan: Pick<PlanCobro, 'moneda' | 'regla_uf' | 'uf_pactada'>, ufHoy: number): { clp: number; estimada: boolean } {
    if (plan.moneda === 'CLP') return { clp: Math.round(Number(c.monto) || 0), estimada: false }
    const { uf, estimada } = ufParaCuota(plan, ufHoy)
    return { clp: uf > 0 ? Math.round((Number(c.monto) || 0) * uf) : 0, estimada }
}

/** Resumen de avance de un plan. */
export function resumenPlan(cuotas: CuotaCobro[], facturasPorId: Map<string, FacturaLite>, hoy: string) {
    const r = { total: 0, montoTotal: 0, pagadas: 0, facturadas: 0, pendientes: 0, atrasadas: 0, montoPagado: 0, montoFacturado: 0, montoPendiente: 0 }
    for (const c of cuotas) {
        const e = estadoCuota(c, c.factura_id ? facturasPorId.get(String(c.factura_id)) : undefined, hoy)
        if (e === 'omitida') continue
        r.total++; r.montoTotal += Number(c.monto) || 0
        if (e === 'pagada') { r.pagadas++; r.montoPagado += Number(c.monto) || 0 }
        else if (e === 'facturada') { r.facturadas++; r.montoFacturado += Number(c.monto) || 0 }
        else { r.pendientes++; r.montoPendiente += Number(c.monto) || 0; if (e === 'atrasada') r.atrasadas++ }
    }
    return r
}
