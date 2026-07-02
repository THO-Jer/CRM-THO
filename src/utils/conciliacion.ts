// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE MATCHING PARA CONCILIACIÓN BANCARIA
// Funciones puras (sin dependencias de Supabase/React) — extraídas de
// useFinanzas para poder testearlas con Vitest.
// ─────────────────────────────────────────────────────────────────────────────

// Palabras que no aportan al matching (comunes en descripciones bancarias y docs)
const STOP_WORDS = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'en', 'con', 'por', 'para', 'y', 'a',
    'transf', 'transferencia', 'pago', 'cargo', 'abono', 'compra', 'web', 'ltda',
    'spa', 'eirl', 's.a', 'sa', 'srl', 'cia', 'the', 'and', 'via', 'pvto',
])

export function normalizeText(s: string): string[] {
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
export function tokenSimilarity(a: string, b: string): number {
    const ta = new Set(normalizeText(a))
    const tb = new Set(normalizeText(b))
    if (ta.size === 0 || tb.size === 0) return 0
    let intersection = 0
    ta.forEach(t => { if (tb.has(t)) intersection++ })
    const union = ta.size + tb.size - intersection
    return union === 0 ? 0 : intersection / union
}

/**
 * Score de monto: 1.0 si es idéntico, 0 si la diferencia supera `tolerance`.
 * tolerance=0.15 por defecto (15%).
 * Bonus: si la diferencia es < 0.5%, retorna 1.0 independiente de la tolerancia.
 */
export function scoreAmount(montoCLP: number, montoDoc: number, tolerance = 0.15): number {
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
export function scoreDate(fechaMov: Date, fechaDoc: string | null | undefined, maxDays = 45): number {
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
export function compositeScore(sAmt: number, sDate: number, sText: number): number {
    if (sAmt === 0) return 0
    if (sText >= 0.30) {
        // Texto significativo → pesos: monto 50%, fecha 25%, texto 25%
        return sAmt * 0.50 + sDate * 0.25 + sText * 0.25
    }
    return sAmt * 0.55 + sDate * 0.30 + sText * 0.15
}
