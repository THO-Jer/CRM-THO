import { useState } from 'react'
import { Plus, Trash2, Lock, Link2 } from 'lucide-react'
import { ufDeFecha } from '../../utils/uf'
import { formatDate } from '../../utils/formatters'
import { montoCLPCuota, type PlanCobro, type CuotaCobro } from '../../utils/cobros'
import { regenerarMensual, type PlanDraft } from '../../utils/planDraft'

// ─────────────────────────────────────────────────────────────────────────────
// Editor del plan de cobro. Se usa:
//   - en el modal "Convertir prospecto" (al ganar un deal)
//   - en la ficha de un Ticket/KA → pestaña Facturación (crear/editar plan)
// Es controlado: recibe un `draft` y devuelve cambios por `onChange`.
// ─────────────────────────────────────────────────────────────────────────────

const inputCls = 'mt-1 w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
const labelCls = 'text-xs font-medium text-gray-600 dark:text-gray-300'
const segBtn = (on: boolean) => `flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${on ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`

export default function PlanCobroEditor({ draft, onChange, ufHoy }: { draft: PlanDraft; onChange: (d: PlanDraft) => void; ufHoy: number }) {
    const { plan, cuotas, params } = draft
    const [buscandoUF, setBuscandoUF] = useState(false)

    const setPlan = (patch: Partial<PlanCobro>, regen = false) => {
        const d = { ...draft, plan: { ...plan, ...patch } }
        onChange(regen && d.plan.modalidad === 'mensual' ? { ...d, cuotas: regenerarMensual(d) } : d)
    }
    const setParams = (patch: Partial<PlanDraft['params']>) => {
        const d = { ...draft, params: { ...params, ...patch } }
        onChange({ ...d, cuotas: regenerarMensual(d) })
    }
    const setCuota = (i: number, patch: Partial<CuotaCobro>) => onChange({ ...draft, cuotas: cuotas.map((c, j) => j === i ? { ...c, ...patch } : c) })
    const addHito = () => {
        const n = cuotas.length + 1
        onChange({ ...draft, cuotas: [...cuotas, { numero: n, fecha_programada: cuotas[cuotas.length - 1]?.fecha_programada || params.primeraFecha, glosa: `Hito ${n}`, monto: 0, factura_id: null, omitida: false }] })
    }
    const removeCuota = (i: number) => onChange({ ...draft, cuotas: cuotas.filter((_, j) => j !== i).map((c, j) => ({ ...c, numero: j + 1 })) })

    const cambiarModalidad = (m: 'mensual' | 'hitos') => {
        if (m === plan.modalidad) return
        const d = { ...draft, plan: { ...plan, modalidad: m } }
        if (m === 'mensual') onChange({ ...d, cuotas: regenerarMensual(d) })
        else onChange({ ...d, cuotas: cuotas.map((c, j) => ({ ...c, glosa: c.factura_id ? c.glosa : `Hito ${j + 1}` })) })
    }

    const cambiarFechaUF = async (fecha: string) => {
        setPlan({ fecha_uf_pactada: fecha })
        if (!fecha) return
        setBuscandoUF(true)
        const uf = await ufDeFecha(fecha)
        setBuscandoUF(false)
        if (uf) onChange({ ...draft, plan: { ...plan, fecha_uf_pactada: fecha, uf_pactada: uf } })
    }

    const total = cuotas.filter(c => !c.omitida).reduce((s, c) => s + (Number(c.monto) || 0), 0)
    const totalCLP = cuotas.filter(c => !c.omitida).reduce((s, c) => s + montoCLPCuota(c, plan, ufHoy).clp, 0)
    const estimado = plan.moneda === 'UF' && !(plan.regla_uf === 'congelada' && Number(plan.uf_pactada) > 0)
    const fmt = (n: number) => plan.moneda === 'UF' ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF` : `$${Math.round(n).toLocaleString('es-CL')}`

    return (
        <div className="space-y-4">
            {/* Modalidad + moneda */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <div className={labelCls}>Forma de cobro</div>
                    <div className="mt-1 flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-lg">
                        <button type="button" className={segBtn(plan.modalidad === 'mensual')} onClick={() => cambiarModalidad('mensual')}>Cuotas mensuales</button>
                        <button type="button" className={segBtn(plan.modalidad === 'hitos')} onClick={() => cambiarModalidad('hitos')}>Hitos</button>
                    </div>
                </div>
                <div>
                    <div className={labelCls}>Moneda pactada</div>
                    <div className="mt-1 flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-lg">
                        <button type="button" className={segBtn(plan.moneda === 'UF')} onClick={() => setPlan({ moneda: 'UF' })}>UF</button>
                        <button type="button" className={segBtn(plan.moneda === 'CLP')} onClick={() => setPlan({ moneda: 'CLP' })}>$ CLP</button>
                    </div>
                </div>
            </div>

            {/* Regla UF */}
            {plan.moneda === 'UF' && (
                <div className="rounded-lg border dark:border-gray-700 p-3 space-y-2">
                    <div className={labelCls}>¿Con qué UF se factura?</div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="radio" className="mt-1 accent-naranja" checked={plan.regla_uf === 'congelada'} onChange={() => setPlan({ regla_uf: 'congelada' })} />
                        <span><span className="font-medium text-gray-800 dark:text-gray-200">UF congelada</span> <span className="text-gray-500 dark:text-gray-400">— la del cierre o firma, fija para todas las cuotas</span></span>
                    </label>
                    {plan.regla_uf === 'congelada' && (
                        <div className="grid grid-cols-2 gap-3 pl-6">
                            <div>
                                <label className={labelCls}>Fecha de cierre / firma</label>
                                <input type="date" value={plan.fecha_uf_pactada || ''} onChange={e => void cambiarFechaUF(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>UF pactada {buscandoUF && <span className="text-gray-400">(buscando…)</span>}</label>
                                <input type="number" step="0.01" min="0" value={plan.uf_pactada ?? ''} onChange={e => setPlan({ uf_pactada: e.target.value === '' ? null : Number(e.target.value) })} className={inputCls + ' tnum'} placeholder="ej. 39.485,12" />
                            </div>
                        </div>
                    )}
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="radio" className="mt-1 accent-naranja" checked={plan.regla_uf === 'dia_emision'} onChange={() => setPlan({ regla_uf: 'dia_emision' })} />
                        <span><span className="font-medium text-gray-800 dark:text-gray-200">UF del día de emisión</span> <span className="text-gray-500 dark:text-gray-400">— cada factura con la UF del día en que se emite</span></span>
                    </label>
                </div>
            )}

            {/* Parámetros mensuales */}
            {plan.modalidad === 'mensual' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <label className={labelCls}>Monto por cuota ({plan.moneda})</label>
                        <input type="number" step="0.01" min="0" value={params.montoCuota} onChange={e => setParams({ montoCuota: e.target.value })} className={inputCls + ' tnum'} />
                    </div>
                    <div>
                        <label className={labelCls}>N° de cuotas</label>
                        <input type="number" min="1" max="120" value={params.nCuotas} onChange={e => setParams({ nCuotas: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })} className={inputCls + ' tnum'} />
                    </div>
                    <div>
                        <label className={labelCls}>Primera cuota</label>
                        <input type="date" value={params.primeraFecha} onChange={e => setParams({ primeraFecha: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Día de facturación</label>
                        <input type="number" min="1" max="31" value={plan.dia_facturacion ?? ''} placeholder="mismo día" onChange={e => setPlan({ dia_facturacion: e.target.value ? Math.max(1, Math.min(31, parseInt(e.target.value))) : null }, true)} className={inputCls + ' tnum'} />
                    </div>
                </div>
            )}

            {/* Cuotas */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <div className={labelCls}>{plan.modalidad === 'mensual' ? 'Cuotas generadas' : 'Hitos de pago'} ({cuotas.length})</div>
                    {plan.modalidad === 'hitos' && (
                        <button type="button" onClick={addHito} className="inline-flex items-center gap-1 text-xs text-naranja hover:underline"><Plus size={13} /> Agregar hito</button>
                    )}
                </div>
                <div className="max-h-56 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-700">
                    {cuotas.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin cuotas aún</p>}
                    {cuotas.map((c, i) => {
                        const bloqueada = !!c.factura_id
                        const clp = montoCLPCuota(c, plan, ufHoy)
                        return (
                            <div key={c.id || `n${i}`} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${c.omitida ? 'opacity-50' : ''}`}>
                                <span className="w-6 text-gray-400 tnum">{c.numero}</span>
                                {plan.modalidad === 'hitos' && !bloqueada ? (<>
                                    <input type="date" value={c.fecha_programada} onChange={e => setCuota(i, { fecha_programada: e.target.value })} className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-[8.5rem]" />
                                    <input value={c.glosa || ''} onChange={e => setCuota(i, { glosa: e.target.value })} className="flex-1 min-w-0 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700" placeholder="Glosa (ej. Informe diagnóstico)" />
                                    <input type="number" step="0.01" min="0" value={c.monto || ''} onChange={e => setCuota(i, { monto: Number(e.target.value) || 0 })} className="w-20 px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-right tnum" />
                                </>) : (<>
                                    <span className="w-[5.5rem] text-gray-600 dark:text-gray-300">{formatDate(c.fecha_programada)}</span>
                                    <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{c.glosa}</span>
                                    <span className="tnum font-medium text-gray-800 dark:text-gray-100">{fmt(Number(c.monto) || 0)}</span>
                                </>)}
                                <span className="w-24 text-right tnum text-gray-400" title={clp.estimada ? 'Estimado con la UF de hoy' : ''}>{plan.moneda === 'UF' && clp.clp ? `${clp.estimada ? '~' : ''}$${clp.clp.toLocaleString('es-CL')}` : ''}</span>
                                {bloqueada
                                    ? <span title="Ya tiene factura vinculada: no se puede modificar"><Lock size={13} className="text-gray-400" /></span>
                                    : plan.modalidad === 'hitos'
                                        ? <button type="button" onClick={() => removeCuota(i)} className="text-gray-400 hover:text-red-500" aria-label="Quitar hito"><Trash2 size={13} /></button>
                                        : <span className="w-[13px]" />}
                            </div>
                        )
                    })}
                </div>
                <div className="flex justify-between items-baseline mt-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Total del acuerdo</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 tnum">
                        {fmt(total)}
                        {plan.moneda === 'UF' && totalCLP > 0 && <span className="ml-2 text-xs font-normal text-gray-500">{estimado ? '≈ ' : '= '}${totalCLP.toLocaleString('es-CL')}{estimado ? ' (UF de hoy)' : ''}</span>}
                    </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Facturas exentas de IVA: el monto de la cuota es el total a facturar.</p>
            </div>

            <div>
                <label className={labelCls}><Link2 size={11} className="inline -mt-0.5 mr-1" />Link al acuerdo / contrato (opcional)</label>
                <input value={plan.documento_url || ''} onChange={e => setPlan({ documento_url: e.target.value })} className={inputCls} placeholder="https://… (carpeta en la nube)" />
            </div>
        </div>
    )
}
