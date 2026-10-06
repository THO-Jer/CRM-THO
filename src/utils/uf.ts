// ─────────────────────────────────────────────────────────────────────────────
// UF HISTÓRICA
//
// Regla contable del CRM:
//   1. El PESO (CLP) es la verdad contable: es lo que dice el SII y el banco.
//   2. La UF de un documento es la del DÍA DEL DOCUMENTO (emisión, pago,
//      movimiento), nunca la UF del día en que se importó o se está mirando.
//   3. Si no hay UF disponible, NO se inventa un valor (antes había fallbacks
//      fijos de 38.000/39.000 que hoy están ~6% por debajo de la UF real).
//
// Fuente: mindicador.cl. Se pide la serie del AÑO completo (1 request por año)
// y se cachea en memoria + localStorage.
// ─────────────────────────────────────────────────────────────────────────────

type SerieAnio = Record<string, number> // 'YYYY-MM-DD' → valor UF

const memoria = new Map<number, SerieAnio>()
const enVuelo = new Map<number, Promise<SerieAnio | null>>()
const CACHE_KEY = (anio: number) => `uf_serie_${anio}`
const SEIS_HORAS = 6 * 60 * 60 * 1000

function leerCache(anio: number): { serie: SerieAnio; ts: number } | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY(anio))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.serie) return parsed
    } catch { /* cache corrupto o storage bloqueado */ }
    return null
}

function escribirCache(anio: number, serie: SerieAnio) {
    try { localStorage.setItem(CACHE_KEY(anio), JSON.stringify({ serie, ts: Date.now() })) } catch { /* silencio */ }
}

/**
 * Serie diaria de UF de un año. Años pasados se cachean para siempre;
 * el año en curso se refresca cada 6 h (la UF se publica hasta el día 9 del mes siguiente).
 */
export async function cargarSerieUFAnio(anio: number): Promise<SerieAnio | null> {
    const enMemoria = memoria.get(anio)
    if (enMemoria) return enMemoria

    const anioActual = new Date().getFullYear()
    const cache = leerCache(anio)
    if (cache && (anio < anioActual || Date.now() - cache.ts < SEIS_HORAS)) {
        memoria.set(anio, cache.serie)
        return cache.serie
    }

    const pendiente = enVuelo.get(anio)
    if (pendiente) return pendiente

    const p = (async () => {
        try {
            const res = await fetch(`https://mindicador.cl/api/uf/${anio}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const serie: SerieAnio = {}
            for (const item of (data?.serie ?? []) as { fecha: string; valor: number }[]) {
                const ymd = String(item.fecha).slice(0, 10)
                if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && Number(item.valor) > 0) serie[ymd] = Number(item.valor)
            }
            if (Object.keys(serie).length === 0) throw new Error('serie vacía')
            memoria.set(anio, serie)
            escribirCache(anio, serie)
            return serie
        } catch (e) {
            console.warn(`No se pudo obtener la serie UF ${anio}`, e)
            // Cache vencido es mejor que nada
            if (cache) { memoria.set(anio, cache.serie); return cache.serie }
            return null
        } finally {
            enVuelo.delete(anio)
        }
    })()
    enVuelo.set(anio, p)
    return p
}

/**
 * UF de una fecha 'YYYY-MM-DD'. Si justo ese día no está en la serie, usa el
 * día anterior más cercano (hasta 10 días atrás). null si no hay dato.
 */
export async function ufDeFecha(ymd: string | null | undefined): Promise<number | null> {
    const fecha = String(ymd ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
    const anio = Number(fecha.slice(0, 4))
    const serie = await cargarSerieUFAnio(anio)
    if (serie?.[fecha]) return serie[fecha]

    // Buscar hacia atrás (cruza al año anterior si hace falta)
    const d = new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))
    for (let i = 1; i <= 10; i++) {
        d.setDate(d.getDate() - 1)
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const s = d.getFullYear() === anio ? serie : await cargarSerieUFAnio(d.getFullYear())
        if (s?.[k]) return s[k]
    }
    return null
}

/** UF para muchas fechas a la vez (1 request por año involucrado). */
export async function ufParaFechas(fechas: (string | null | undefined)[]): Promise<Map<string, number>> {
    const unicas = [...new Set(fechas.map(f => String(f ?? '').slice(0, 10)).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)))]
    const anios = [...new Set(unicas.map(f => Number(f.slice(0, 4))))]
    await Promise.all(anios.map(cargarSerieUFAnio))
    const out = new Map<string, number>()
    for (const f of unicas) {
        const v = await ufDeFecha(f)
        if (v) out.set(f, v)
    }
    return out
}

/** Redondeo a 2 decimales (montos UF y valor diario de la UF, como lo publica el Banco Central). */
export function round2(n: number): number {
    return Math.round(n * 100) / 100
}

/**
 * Re-estampa UF histórica en filas importadas (SII, cartola, BHE):
 * para cada fila, uf_dia = UF de SU fecha y cada campo UF = CLP / esa UF.
 * Si para alguna fecha no hay UF (mindicador caído), usa `ufRespaldo`
 * y lo informa en `sinUF` para poder avisar al usuario.
 */
export async function aplicarUFHistorica<T extends Record<string, unknown>>(
    rows: T[],
    { fecha, pares, ufRespaldo }: { fecha: (r: T) => string | null | undefined; pares: [string, string][]; ufRespaldo: number }
): Promise<{ rows: T[]; sinUF: number }> {
    const mapa = await ufParaFechas(rows.map(fecha))
    let sinUF = 0
    const out = rows.map(r => {
        const f = String(fecha(r) ?? '').slice(0, 10)
        let uf = mapa.get(f) ?? 0
        if (!uf) { sinUF++; uf = ufRespaldo > 0 ? ufRespaldo : 0 }
        const copia: Record<string, unknown> = { ...r, uf_dia: uf || null }
        for (const [campoCLP, campoUF] of pares) {
            const clp = Number(r[campoCLP])
            copia[campoUF] = uf && Number.isFinite(clp) ? round2(clp / uf) : null
        }
        return copia as T
    })
    return { rows: out, sinUF }
}
