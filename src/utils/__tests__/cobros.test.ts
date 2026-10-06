import { describe, it, expect } from 'vitest'
import { mesesEntre, generarCuotasMensuales, estadoCuota, montoCLPCuota, resumenPlan, type CuotaCobro } from '../cobros'
import { montoEmitida, montoLiquidacion, sumar } from '../montos'

describe('mesesEntre', () => {
    it('contrato de un año', () => expect(mesesEntre('2026-01-15', '2026-12-14')).toBe(12))
    it('mes calendario completo', () => expect(mesesEntre('2026-03-01', '2026-03-31')).toBe(1))
    it('enero a diciembre', () => expect(mesesEntre('2026-01-01', '2026-12-31')).toBe(12))
    it('fin antes de inicio = 0', () => expect(mesesEntre('2026-05-01', '2026-04-01')).toBe(0))
})

describe('generarCuotasMensuales', () => {
    it('genera N cuotas y ajusta el día 31 en meses cortos', () => {
        const c = generarCuotasMensuales({ primeraFecha: '2026-01-31', nCuotas: 3, monto: 20, servicio: 'RC' })
        expect(c.map(x => x.fecha_programada)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
        expect(c[1].glosa).toContain('cuota 2/3')
        expect(c.every(x => x.monto === 20)).toBe(true)
    })
    it('cruza el año', () => {
        const c = generarCuotasMensuales({ primeraFecha: '2026-11-05', nCuotas: 3, monto: 10, diaFacturacion: 1 })
        expect(c.map(x => x.fecha_programada)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    })
})

describe('estadoCuota', () => {
    const base: CuotaCobro = { numero: 1, fecha_programada: '2026-10-05', glosa: null, monto: 10, factura_id: null, omitida: false }
    const hoy = '2026-10-20'
    it('este mes sin factura = por facturar', () => expect(estadoCuota(base, undefined, hoy)).toBe('por_facturar'))
    it('mes anterior sin factura = atrasada', () => expect(estadoCuota({ ...base, fecha_programada: '2026-09-30' }, undefined, hoy)).toBe('atrasada'))
    it('mes futuro = programada', () => expect(estadoCuota({ ...base, fecha_programada: '2026-11-05' }, undefined, hoy)).toBe('programada'))
    it('con factura pendiente = facturada', () => expect(estadoCuota({ ...base, factura_id: '7' }, { id: 7, estado: 'Pendiente' }, hoy)).toBe('facturada'))
    it('factura Cobrada o Pagada = pagada', () => {
        expect(estadoCuota({ ...base, factura_id: '7' }, { id: 7, estado: 'Cobrada' }, hoy)).toBe('pagada')
        expect(estadoCuota({ ...base, factura_id: '7' }, { id: 7, estado: 'Pagada' }, hoy)).toBe('pagada')
    })
    it('omitida manda', () => expect(estadoCuota({ ...base, omitida: true }, undefined, hoy)).toBe('omitida'))
})

describe('montoCLPCuota', () => {
    it('UF congelada usa la UF pactada, no la de hoy', () => {
        expect(montoCLPCuota({ monto: 10 }, { moneda: 'UF', regla_uf: 'congelada', uf_pactada: 39000 }, 41000)).toEqual({ clp: 390000, estimada: false })
    })
    it('UF del día de emisión usa la de hoy y queda marcada como estimada', () => {
        expect(montoCLPCuota({ monto: 10 }, { moneda: 'UF', regla_uf: 'dia_emision', uf_pactada: null }, 41000)).toEqual({ clp: 410000, estimada: true })
    })
    it('plan en CLP devuelve el monto tal cual', () => {
        expect(montoCLPCuota({ monto: 500000 }, { moneda: 'CLP', regla_uf: 'congelada', uf_pactada: null }, 41000)).toEqual({ clp: 500000, estimada: false })
    })
})

describe('resumenPlan', () => {
    it('suma por estado', () => {
        const cuotas: CuotaCobro[] = [
            { numero: 1, fecha_programada: '2026-08-01', glosa: null, monto: 10, factura_id: '1', omitida: false },
            { numero: 2, fecha_programada: '2026-09-01', glosa: null, monto: 10, factura_id: '2', omitida: false },
            { numero: 3, fecha_programada: '2026-09-15', glosa: null, monto: 10, factura_id: null, omitida: false },
            { numero: 4, fecha_programada: '2026-11-01', glosa: null, monto: 10, factura_id: null, omitida: true },
        ]
        const f = new Map([['1', { id: 1, estado: 'Cobrada' }], ['2', { id: 2, estado: 'Pendiente' }]])
        const r = resumenPlan(cuotas, f, '2026-10-06')
        expect(r).toMatchObject({ total: 3, pagadas: 1, facturadas: 1, pendientes: 1, atrasadas: 1, montoTotal: 30 })
    })
})

describe('montos por documento (EERR)', () => {
    it('usa el CLP real del documento, no UF × UF de hoy', () => {
        const m = montoEmitida({ total_monto_clp: 1000000, monto_uf: 25.5, uf_dia: 39215.69 })
        expect(m.clp).toBe(1000000)
        expect(m.uf).toBe(25.5)
    })
    it('completa CLP desde UF con la UF del documento', () => {
        expect(montoEmitida({ monto_uf: 10, uf_dia: 39000 }).clp).toBe(390000)
    })
    it('liquidación: costo empleador y UF de su fecha', () => {
        expect(montoLiquidacion({ costo_total_empleador: 800000, uf_dia: 40000 })).toEqual({ clp: 800000, uf: 20 })
    })
    it('suma CLP y UF por separado', () => {
        const s = sumar([{ monto_clp: 100, monto_uf: 1 }, { total_monto_clp: 200, monto_uf: 2 }], montoEmitida)
        expect(s).toEqual({ clp: 300, uf: 3 })
    })
})
