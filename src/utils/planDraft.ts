// Borrador del plan de cobro que maneja el editor (PlanCobroEditor) antes de guardarse.
import { generarCuotasMensuales, mesesEntre, type PlanCobro, type CuotaCobro, type EntidadCobro } from './cobros'
import { todayYMD } from './formatters'

export interface PlanDraft {
    plan: PlanCobro
    cuotas: CuotaCobro[]
    params: { primeraFecha: string; nCuotas: number; montoCuota: string }
}

export function draftInicial({ entidad_tipo, entidad_id = '', organizacion, servicio, montoCuota, inicio, fin, fechaUF, moneda = 'UF' }: {
    entidad_tipo: EntidadCobro; entidad_id?: string; organizacion?: string | null; servicio?: string | null
    montoCuota?: number | string | null; inicio?: string | null; fin?: string | null; fechaUF?: string | null; moneda?: 'UF' | 'CLP'
}): PlanDraft {
    const primeraFecha = inicio || todayYMD()
    const nCuotas = inicio && fin ? Math.max(1, mesesEntre(inicio, fin)) : (entidad_tipo === 'key_account' ? 12 : 1)
    const plan: PlanCobro = {
        entidad_tipo, entidad_id, organizacion: organizacion ?? null, servicio: servicio ?? null,
        modalidad: 'mensual', moneda, regla_uf: 'congelada', uf_pactada: null, fecha_uf_pactada: fechaUF || primeraFecha,
        dia_facturacion: null, estado: 'activo', documento_url: null, notas: null,
    }
    const m = montoCuota != null && montoCuota !== '' ? String(montoCuota) : ''
    const cuotas = generarCuotasMensuales({ primeraFecha, nCuotas, monto: Number(m) || 0, servicio })
    return { plan, cuotas, params: { primeraFecha, nCuotas, montoCuota: m } }
}

/** Draft a partir de un plan ya guardado. */
export function draftDesdePlan(plan: PlanCobro, cuotas: CuotaCobro[]): PlanDraft {
    const ord = [...cuotas].sort((a, b) => a.numero - b.numero)
    return {
        plan, cuotas: ord,
        params: { primeraFecha: ord[0]?.fecha_programada || todayYMD(), nCuotas: ord.length || 1, montoCuota: ord[0] ? String(ord[0].monto) : '' },
    }
}

/** Regenera cuotas mensuales preservando las ya facturadas y los ids existentes. */
export function regenerarMensual(d: PlanDraft): CuotaCobro[] {
    const gen = generarCuotasMensuales({
        primeraFecha: d.params.primeraFecha, nCuotas: d.params.nCuotas,
        monto: Number(d.params.montoCuota) || 0, diaFacturacion: d.plan.dia_facturacion, servicio: d.plan.servicio,
    })
    const out = gen.map(g => {
        const ex = d.cuotas.find(c => c.numero === g.numero)
        if (ex?.factura_id) return ex
        return ex ? { ...g, id: ex.id, plan_id: ex.plan_id, omitida: ex.omitida } : g
    })
    // Cuotas ya facturadas que quedarían fuera al reducir el número de cuotas: se conservan
    return out.concat(d.cuotas.filter(c => c.factura_id && c.numero > gen.length))
}

/** Valida el draft antes de guardar. Devuelve el mensaje de error o null. */
export function validarDraft(d: PlanDraft): string | null {
    if (!d.cuotas.length) return 'El plan no tiene cuotas'
    if (d.cuotas.some(c => !c.fecha_programada)) return 'Todas las cuotas necesitan fecha'
    if (d.cuotas.some(c => !(Number(c.monto) >= 0))) return 'Hay cuotas con monto inválido'
    if (d.cuotas.every(c => !Number(c.monto))) return 'Indica el monto de las cuotas'
    if (d.plan.moneda === 'UF' && d.plan.regla_uf === 'congelada' && !(Number(d.plan.uf_pactada) > 0)) return 'Falta la UF pactada (o elige "UF del día de emisión")'
    return null
}

