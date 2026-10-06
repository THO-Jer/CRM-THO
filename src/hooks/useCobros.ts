import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import type { PlanCobro, CuotaCobro, FacturaLite, EntidadCobro } from '../utils/cobros'

const SELECT_FACTURA_LITE = 'id, folio, numero_factura, estado, fecha_emision, fecha_pago, cliente, total_monto_clp, monto_clp, monto_uf, uf_dia, crm_ticket_id, crm_ka_id'

/** ¿El error es porque aún no se corrió sql/plan-cobros.sql? */
export function esTablaFaltante(msg: string | undefined | null): boolean {
    return !!msg && /(planes_cobro|cuotas_cobro)/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)
}

export interface PlanConCuotas extends PlanCobro { cuotas: CuotaCobro[] }

interface Opciones {
    /** Si se indica, carga solo el plan de esa entidad (ficha del cliente). */
    entidad?: { tipo: EntidadCobro; id: string }
    userEmail?: string | null
}

/**
 * Carga planes de cobro + cuotas + facturas emitidas (versión liviana) y expone
 * las mutaciones. Se usa en la vista Cobranza (todos los planes) y en la ficha
 * de un Ticket/KA (un plan).
 */
export default function useCobros({ entidad, userEmail }: Opciones = {}) {
    const [planes, setPlanes] = useState<PlanConCuotas[]>([])
    const [facturas, setFacturas] = useState<FacturaLite[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tablaFaltante, setTablaFaltante] = useState(false)

    const cargar = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            let q = supabase.from('planes_cobro').select('*').is('deleted_at', null).order('organizacion')
            if (entidad) q = q.eq('entidad_tipo', entidad.tipo).eq('entidad_id', String(entidad.id))
            const { data: pl, error: e1 } = await q
            if (e1) throw e1
            const ids = (pl || []).map((p: PlanCobro) => p.id)
            let cuotas: CuotaCobro[] = []
            if (ids.length) {
                const { data: cu, error: e2 } = await supabase.from('cuotas_cobro').select('*').in('plan_id', ids).order('numero')
                if (e2) throw e2
                cuotas = (cu || []) as CuotaCobro[]
            }
            setPlanes(((pl || []) as PlanCobro[]).map(p => ({ ...p, cuotas: cuotas.filter(c => c.plan_id === p.id) })))

            const { data: fa, error: e3 } = await supabase.from('facturas_emitidas').select(SELECT_FACTURA_LITE).order('fecha_emision', { ascending: false }).limit(2000)
            if (e3) throw e3
            setFacturas((fa || []) as FacturaLite[])
            setTablaFaltante(false)
        } catch (err) {
            const msg = (err as Error).message
            if (esTablaFaltante(msg)) setTablaFaltante(true)
            else setError(msg)
        } finally {
            setLoading(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende solo de tipo/id, no de la identidad del objeto
    }, [entidad?.tipo, entidad?.id])

    useEffect(() => { void cargar() }, [cargar])

    /**
     * Crea o actualiza un plan y sincroniza sus cuotas:
     *  - cuotas con id → update
     *  - cuotas sin id → insert
     *  - cuotas que ya no están y NO tienen factura → delete (las facturadas nunca se borran)
     */
    const guardarPlan = useCallback(async (plan: PlanCobro, cuotas: CuotaCobro[]): Promise<string | null> => {
        const planRow = {
            entidad_tipo: plan.entidad_tipo, entidad_id: String(plan.entidad_id),
            organizacion: plan.organizacion, servicio: plan.servicio,
            modalidad: plan.modalidad, moneda: plan.moneda, regla_uf: plan.regla_uf,
            uf_pactada: plan.moneda === 'UF' && plan.uf_pactada ? Number(plan.uf_pactada) : null,
            fecha_uf_pactada: plan.moneda === 'UF' ? (plan.fecha_uf_pactada || null) : null,
            dia_facturacion: plan.dia_facturacion || null,
            estado: plan.estado || 'activo',
            documento_url: plan.documento_url || null,
            notas: plan.notas || null,
        }
        let planId = plan.id
        if (planId) {
            const { error } = await supabase.from('planes_cobro').update(planRow).eq('id', planId)
            if (error) throw error
        } else {
            const { data, error } = await supabase.from('planes_cobro').insert([{ ...planRow, created_by_email: userEmail || null }]).select('id').single()
            if (error) throw error
            planId = (data as { id: string }).id
        }

        const { data: existentes, error: eEx } = await supabase.from('cuotas_cobro').select('id, factura_id').eq('plan_id', planId)
        if (eEx) throw eEx
        const idsNuevos = new Set(cuotas.filter(c => c.id).map(c => c.id))
        const aBorrar = ((existentes || []) as { id: string; factura_id: string | null }[]).filter(c => !idsNuevos.has(c.id) && !c.factura_id).map(c => c.id)
        if (aBorrar.length) {
            const { error } = await supabase.from('cuotas_cobro').delete().in('id', aBorrar)
            if (error) throw error
        }
        const fila = (c: CuotaCobro) => ({
            plan_id: planId, numero: c.numero, fecha_programada: c.fecha_programada,
            glosa: c.glosa || null, monto: Number(c.monto) || 0, omitida: !!c.omitida, notas: c.notas || null,
        })
        const actualizar = cuotas.filter(c => c.id)
        for (const c of actualizar) {
            const { error } = await supabase.from('cuotas_cobro').update(fila(c)).eq('id', c.id)
            if (error) throw error
        }
        const insertar = cuotas.filter(c => !c.id).map(fila)
        if (insertar.length) {
            const { error } = await supabase.from('cuotas_cobro').insert(insertar)
            if (error) throw error
        }
        await cargar()
        return planId ?? null
    }, [cargar, userEmail])

    /** Vincula una factura emitida a una cuota (y de paso al Ticket/KA, si la factura no lo estaba). */
    const vincularFactura = useCallback(async (cuota: CuotaCobro, factura: FacturaLite, plan: PlanCobro) => {
        try {
            const { error } = await supabase.from('cuotas_cobro').update({ factura_id: String(factura.id) }).eq('id', cuota.id)
            if (error) throw error
            const fk = plan.entidad_tipo === 'ticket' ? 'crm_ticket_id' : 'crm_ka_id'
            if (!factura[fk]) {
                const { error: e2 } = await supabase.from('facturas_emitidas').update({ [fk]: plan.entidad_id }).eq('id', factura.id)
                if (e2) console.warn('No se pudo vincular la factura al cliente:', e2.message)
            }
            showToast(`Factura #${factura.folio || factura.numero_factura || factura.id} vinculada a la cuota ${cuota.numero}`, 'success')
            await cargar()
        } catch (err) { showToast('Error al vincular: ' + (err as Error).message, 'error') }
    }, [cargar])

    const desvincularFactura = useCallback(async (cuota: CuotaCobro) => {
        try {
            const { error } = await supabase.from('cuotas_cobro').update({ factura_id: null }).eq('id', cuota.id)
            if (error) throw error
            await cargar()
        } catch (err) { showToast('Error: ' + (err as Error).message, 'error') }
    }, [cargar])

    const toggleOmitida = useCallback(async (cuota: CuotaCobro) => {
        try {
            const { error } = await supabase.from('cuotas_cobro').update({ omitida: !cuota.omitida }).eq('id', cuota.id)
            if (error) throw error
            await cargar()
        } catch (err) { showToast('Error: ' + (err as Error).message, 'error') }
    }, [cargar])

    const eliminarPlan = useCallback(async (plan: PlanCobro) => {
        const { error } = await supabase.from('planes_cobro').update({ deleted_at: new Date().toISOString() }).eq('id', plan.id)
        if (error) throw error
        await cargar()
    }, [cargar])

    return { planes, facturas, loading, error, tablaFaltante, cargar, guardarPlan, vincularFactura, desvincularFactura, toggleOmitida, eliminarPlan }
}

/** Guardado directo (sin el hook), para el flujo de conversión Prospecto → Ticket/KA. */
export async function crearPlanCobro(plan: PlanCobro, cuotas: CuotaCobro[], userEmail?: string | null): Promise<void> {
    const { data, error } = await supabase.from('planes_cobro').insert([{
        entidad_tipo: plan.entidad_tipo, entidad_id: String(plan.entidad_id),
        organizacion: plan.organizacion, servicio: plan.servicio, modalidad: plan.modalidad,
        moneda: plan.moneda, regla_uf: plan.regla_uf,
        uf_pactada: plan.moneda === 'UF' && plan.uf_pactada ? Number(plan.uf_pactada) : null,
        fecha_uf_pactada: plan.moneda === 'UF' ? (plan.fecha_uf_pactada || null) : null,
        dia_facturacion: plan.dia_facturacion || null, estado: 'activo',
        documento_url: plan.documento_url || null, notas: plan.notas || null,
        created_by_email: userEmail || null,
    }]).select('id').single()
    if (error) throw error
    const planId = (data as { id: string }).id
    if (cuotas.length) {
        const { error: e2 } = await supabase.from('cuotas_cobro').insert(cuotas.map(c => ({
            plan_id: planId, numero: c.numero, fecha_programada: c.fecha_programada,
            glosa: c.glosa || null, monto: Number(c.monto) || 0, omitida: !!c.omitida,
        })))
        if (e2) throw e2
    }
}
