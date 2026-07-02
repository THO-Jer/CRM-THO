import { describe, it, expect } from 'vitest'
import { normalizeText, tokenSimilarity, scoreAmount, scoreDate, compositeScore } from '../conciliacion'

describe('normalizeText', () => {
    it('tokeniza, quita tildes, stop-words y tokens cortos', () => {
        expect(normalizeText('Transferencia a EMPRESA ANDINA Ltda.')).toEqual(['empresa', 'andina'])
        expect(normalizeText('Pago de Facturación Eléctrica')).toEqual(['facturacion', 'electrica'])
    })

    it('string vacío o solo stop-words → []', () => {
        expect(normalizeText('')).toEqual([])
        expect(normalizeText('de la el')).toEqual([])
    })
})

describe('tokenSimilarity (Jaccard)', () => {
    it('idénticos = 1, disjuntos = 0', () => {
        expect(tokenSimilarity('Empresa Andina', 'EMPRESA ANDINA')).toBe(1)
        expect(tokenSimilarity('Empresa Andina', 'Constructora Sur')).toBe(0)
    })

    it('solapamiento parcial da valor intermedio', () => {
        const s = tokenSimilarity('Empresa Andina Consultores', 'Empresa Andina')
        expect(s).toBeGreaterThan(0.5)
        expect(s).toBeLessThan(1)
    })

    it('sin tokens útiles = 0', () => {
        expect(tokenSimilarity('', 'Empresa Andina')).toBe(0)
    })
})

describe('scoreAmount', () => {
    it('monto idéntico = 1', () => {
        expect(scoreAmount(100000, 100000)).toBe(1)
    })

    it('diferencia < 0.5% = 1 (bonus)', () => {
        expect(scoreAmount(100000, 100300)).toBe(1)
    })

    it('decae linealmente dentro de la tolerancia', () => {
        const s = scoreAmount(100000, 92500) // diff 7.5% con tolerance 15%
        expect(s).toBeGreaterThan(0.4)
        expect(s).toBeLessThan(0.6)
    })

    it('fuera de tolerancia = 0', () => {
        expect(scoreAmount(100000, 80000)).toBe(0) // 20% > 15%
        expect(scoreAmount(100000, 96000, 0.02)).toBe(0) // tolerancia custom
    })

    it('montos 0/NaN = 0 (monto es obligatorio)', () => {
        expect(scoreAmount(0, 100000)).toBe(0)
        expect(scoreAmount(100000, 0)).toBe(0)
        expect(scoreAmount(NaN, 100000)).toBe(0)
    })
})

describe('scoreDate', () => {
    const mov = new Date(2026, 6, 15) // 15 jul 2026 local

    it('misma fecha = 1', () => {
        expect(scoreDate(mov, '2026-07-15')).toBe(1)
    })

    it('decae linealmente hasta maxDays', () => {
        const s = scoreDate(mov, '2026-07-01') // 14 días de 45
        expect(s).toBeCloseTo(1 - 14 / 45, 2)
    })

    it('fuera de ventana = 0', () => {
        expect(scoreDate(mov, '2026-01-01')).toBe(0)
        expect(scoreDate(mov, '2026-07-01', 10)).toBe(0) // ventana custom de 10 días
    })

    it('sin fecha o inválida = 0.3 (neutro)', () => {
        expect(scoreDate(mov, null)).toBe(0.3)
        expect(scoreDate(mov, 'garbage')).toBe(0.3)
    })
})

describe('compositeScore', () => {
    it('monto 0 anula todo', () => {
        expect(compositeScore(0, 1, 1)).toBe(0)
    })

    it('pesos por defecto: monto 55% + fecha 30% + texto 15%', () => {
        expect(compositeScore(1, 1, 0)).toBeCloseTo(0.85, 5)
        expect(compositeScore(1, 0, 0)).toBeCloseTo(0.55, 5)
    })

    it('texto significativo (≥0.3) re-pondera a 50/25/25', () => {
        expect(compositeScore(1, 1, 1)).toBeCloseTo(1.0, 5)
        expect(compositeScore(1, 0, 0.4)).toBeCloseTo(0.5 + 0.4 * 0.25, 5)
    })

    it('match perfecto de monto+fecha con texto nulo supera el umbral de 0.35', () => {
        // El umbral usado en buscarMatches es 0.35 — esto documenta que un
        // match exacto de monto y fecha entra aunque el texto no diga nada.
        expect(compositeScore(1, 1, 0)).toBeGreaterThan(0.35)
    })
})
