import { describe, it, expect } from 'vitest'
import { parseLocalDate, todayYMD, diasDesdeHoy, normalizeSearch, clpToUF, formatDate } from '../formatters'

// Estos tests protegen el fix del bug UTC (2026-07): new Date('YYYY-MM-DD')
// se parsea a medianoche UTC, que en Chile es la tarde del día ANTERIOR.
// Si alguien reintroduce ese patrón, estos tests deberían fallar.

describe('parseLocalDate', () => {
    it('parsea YYYY-MM-DD como fecha local (no UTC)', () => {
        const d = parseLocalDate('2026-07-15')
        expect(d).not.toBeNull()
        expect(d!.getFullYear()).toBe(2026)
        expect(d!.getMonth()).toBe(6) // julio = 6 (0-based)
        expect(d!.getDate()).toBe(15) // ← con new Date('2026-07-15') en UTC-4 esto daría 14
        expect(d!.getHours()).toBe(0)
    })

    it('acepta timestamps y toma solo la parte de fecha', () => {
        const d = parseLocalDate('2026-01-01T18:30:00Z')
        expect(d!.getDate()).toBe(1)
        expect(d!.getMonth()).toBe(0)
    })

    it('devuelve null para inválidos', () => {
        expect(parseLocalDate(null)).toBeNull()
        expect(parseLocalDate('')).toBeNull()
        expect(parseLocalDate('no-es-fecha')).toBeNull()
        expect(parseLocalDate('15/07/2026')).toBeNull()
    })
})

describe('todayYMD', () => {
    it('devuelve la fecha local en formato YYYY-MM-DD', () => {
        const ymd = todayYMD()
        expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const hoy = new Date()
        expect(ymd).toBe(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`)
    })
})

describe('diasDesdeHoy', () => {
    it('hoy = 0', () => {
        expect(diasDesdeHoy(todayYMD())).toBe(0)
    })

    it('mañana = 1, ayer = -1', () => {
        const d = new Date()
        const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
        const manana = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        const ayer = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
        expect(diasDesdeHoy(fmt(manana))).toBe(1)
        expect(diasDesdeHoy(fmt(ayer))).toBe(-1)
    })

    it('null para fechas inválidas', () => {
        expect(diasDesdeHoy(null)).toBeNull()
        expect(diasDesdeHoy('xx')).toBeNull()
    })
})

describe('normalizeSearch', () => {
    it('quita acentos y baja a minúsculas', () => {
        expect(normalizeSearch('Pérez')).toBe('perez')
        expect(normalizeSearch('MUÑOZ')).toBe('munoz')
        expect(normalizeSearch('Ándrés Ñandú')).toBe('andres nandu')
    })

    it('maneja null/undefined', () => {
        expect(normalizeSearch(null)).toBe('')
        expect(normalizeSearch(undefined)).toBe('')
    })
})

describe('clpToUF', () => {
    it('usa uf_dia del registro cuando existe', () => {
        expect(clpToUF(39000, 39000, 38000)).toBe(1)
    })

    it('usa el fallback si uf_dia falta o es 0', () => {
        expect(clpToUF(38000, null, 38000)).toBe(1)
        expect(clpToUF(38000, 0, 38000)).toBe(1)
    })

    it('devuelve 0 con montos no numéricos o divisor 0', () => {
        expect(clpToUF('abc', null, 38000)).toBe(0)
        expect(clpToUF(1000, null, 0)).toBe(0)
    })
})

describe('formatDate', () => {
    it('no corre el día para fechas sin hora (bug UTC)', () => {
        // En es-CL el formato es dd-mm-yyyy; lo importante es que el día sea 15, no 14
        expect(formatDate('2026-07-15')).toContain('15')
        expect(formatDate('2026-01-01')).toContain('2026')
    })

    it('devuelve "-" para inválidos', () => {
        expect(formatDate(null)).toBe('-')
        expect(formatDate('')).toBe('-')
    })
})
