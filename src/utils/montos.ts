// ─────────────────────────────────────────────────────────────────────────────
// MONTOS POR DOCUMENTO — UF y CLP leídos del propio documento
//
// Antes, el EERR sumaba UF y luego multiplicaba por la UF de HOY para
// mostrar pesos: una factura de $1.000.000 de enero aparecía meses después
// como ~$1.030.000. Ahora cada documento aporta SU monto CLP real (el del
// SII / banco) y SU monto UF (calculado con la UF de su fecha), y se suman
// por separado. Así el EERR en pesos cuadra con el SII y no cambia solo.
//
// Además tolera el drift de columnas entre tablas (total_monto_clp vs
// monto_clp, monto_bruto_uf vs monto_uf, etc.).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>

export interface Monto { uf: number; clp: number }

export const CERO: Monto = { uf: 0, clp: 0 }

function num(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

function primero(r: Rec, keys: string[]): number {
    for (const k of keys) {
        const n = num(r[k])
        if (n !== 0) return n
    }
    return 0
}

/** Completa el lado faltante usando la UF DEL DOCUMENTO (uf_dia), nunca la de hoy. */
function completar(clp: number, uf: number, ufDia: number): Monto {
    if (!clp && uf && ufDia) clp = Math.round(uf * ufDia)
    if (!uf && clp && ufDia) uf = clp / ufDia
    return { uf, clp }
}

export const montoEmitida = (f: Rec): Monto =>
    completar(primero(f, ['total_monto_clp', 'monto_clp', 'monto_total']), primero(f, ['monto_uf']), num(f.uf_dia))

export const montoRecibida = (f: Rec): Monto =>
    completar(primero(f, ['monto_clp', 'total_monto_clp', 'monto_total']), primero(f, ['monto_uf']), num(f.uf_dia))

/** Honorarios: monto BRUTO (gasto de la empresa). */
export const montoBoleta = (b: Rec): Monto =>
    completar(primero(b, ['monto_bruto_clp', 'monto_bruto']), primero(b, ['monto_bruto_uf', 'monto_uf']), num(b.uf_dia))

/** Retención de la boleta (se paga al SII vía F29). */
export const montoRetencion = (b: Rec): Monto =>
    completar(primero(b, ['monto_retencion_clp', 'monto_retenido_clp']), primero(b, ['monto_retencion_uf']), num(b.uf_dia))

/** Liquidaciones: costo total empleador. */
export const montoLiquidacion = (l: Rec): Monto =>
    completar(primero(l, ['costo_total_empleador']), primero(l, ['monto_uf']), num(l.uf_dia))

export const montoSueldoSocio = (s: Rec): Monto =>
    completar(primero(s, ['monto_clp', 'monto_liquido', 'monto_bruto']), primero(s, ['monto_uf']), num(s.uf_dia))

export const montoCaja = (c: Rec): Monto =>
    completar(primero(c, ['monto_clp', 'monto']), primero(c, ['monto_uf']), num(c.uf_dia))

export function sumar<T>(items: T[], fn: (x: T) => Monto): Monto {
    return items.reduce<Monto>((acc, x) => { const m = fn(x); return { uf: acc.uf + m.uf, clp: acc.clp + m.clp } }, { uf: 0, clp: 0 })
}

export const mas = (...ms: Monto[]): Monto => ms.reduce((a, m) => ({ uf: a.uf + m.uf, clp: a.clp + m.clp }), { uf: 0, clp: 0 })
export const menos = (a: Monto, b: Monto): Monto => ({ uf: a.uf - b.uf, clp: a.clp - b.clp })
export const por = (a: Monto, k: number): Monto => ({ uf: a.uf * k, clp: a.clp * k })
