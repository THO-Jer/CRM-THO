import { useMemo, useState } from 'react'
import { CalendarClock, Pencil, Plus, ExternalLink, Unlink } from 'lucide-react'
import useCobros from '../../hooks/useCobros'
import { formatDate, todayYMD } from '../../utils/formatters'
import { estadoCuota, montoCLPCuota, resumenPlan, ufParaCuota, ESTADO_CUOTA_LABEL, type EstadoCuota, type FacturaLite } from '../../utils/cobros'
import { draftDesdePlan, draftInicial } from '../../utils/planDraft'
import PlanCobroModal from './PlanCobroModal'

const BADGE: Record<EstadoCuota, string> = {
    atrasada: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    por_facturar: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    facturada: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    pagada: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    programada: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    omitida: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
}

/**
 * Plan de cobro dentro de la ficha de un Ticket / Key Account (pestaña Facturación).
 * Muestra qué cuotas están pagadas, facturadas o por facturar, y permite crear/editar el plan.
 */
export default function PlanCobroPanel({ tipo, item, ufActual, userEmail, onCambio }: {
    tipo: 'ticket' | 'keyaccount'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: Record<string, any>
    ufActual: number
    userEmail?: string | null
    onCambio?: () => void
}) {
    const entidadTipo = tipo === 'keyaccount' ? 'key_account' as const : 'ticket' as const
    const { planes, facturas, loading, tablaFaltante, error, guardarPlan, vincularFactura, desvincularFactura } = useCobros({ entidad: { tipo: entidadTipo, id: String(item.id) }, userEmail })
    const [editando, setEditando] = useState(false)
    const hoy = todayYMD()
    const plan = planes[0]
    const facturasPorId = useMemo(() => new Map(facturas.map(f => [String(f.id), f])), [facturas])

    // Facturas candidatas: las ya vinculadas a esta entidad y no asignadas a otra cuota
    const usadas = new Set((plan?.cuotas || []).filter(c => c.factura_id).map(c => String(c.factura_id)))
    const fk = entidadTipo === 'ticket' ? 'crm_ticket_id' : 'crm_ka_id'
    const candidatas = facturas.filter(f => String(f[fk] ?? '') === String(item.id) && !usadas.has(String(f.id)))

    if (loading) return <p className="text-xs text-gray-400 text-center py-3 animate-pulse">Cargando plan de cobro…</p>
    if (tablaFaltante) return (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            Plan de cobro no disponible: falta correr <code>sql/plan-cobros.sql</code> en Supabase.
        </div>
    )
    if (error) return <p className="text-xs text-red-500">Error plan de cobro: {error}</p>

    const abrirNuevo = () => setEditando(true)
    const inicial = plan ? draftDesdePlan(plan, plan.cuotas) : draftInicial({
        entidad_tipo: entidadTipo, entidad_id: String(item.id), organizacion: item.organizacion,
        servicio: tipo === 'keyaccount' ? item.servicio : item.ticket,
        montoCuota: tipo === 'keyaccount' ? item.uf_mes : item.valor_monto,
        moneda: tipo === 'ticket' && item.valor_moneda === 'CLP' ? 'CLP' : 'UF',
        inicio: tipo === 'keyaccount' ? item.inicio_contrato : item.fecha_inicio,
        fin: tipo === 'keyaccount' ? item.fin_contrato : null,
        fechaUF: tipo === 'keyaccount' ? item.inicio_contrato : item.fecha_inicio,
    })

    const modal = editando && (
        <PlanCobroModal titulo={plan ? 'Editar plan de cobro' : 'Crear plan de cobro'} subtitulo={item.organizacion} inicial={inicial} ufHoy={ufActual}
            onGuardar={async (p, c) => { await guardarPlan(p, c); onCambio?.() }} onClose={() => setEditando(false)} />
    )

    if (!plan) return (
        <div className="border border-dashed dark:border-gray-600 rounded-xl p-4 text-center">
            <CalendarClock size={20} className="mx-auto text-gray-400 mb-1.5" />
            <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">Sin plan de cobro</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Carga una vez la duración, el monto por cuota y la UF pactada del acuerdo.</p>
            <button onClick={abrirNuevo} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg color-naranja text-white text-xs font-medium"><Plus size={13} /> Crear plan de cobro</button>
            {modal}
        </div>
    )

    const r = resumenPlan(plan.cuotas, facturasPorId, hoy)
    const { uf: ufPlan, estimada } = ufParaCuota(plan, ufActual)
    const fmt = (n: number) => plan.moneda === 'UF' ? `${(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF` : `$${Math.round(n).toLocaleString('es-CL')}`
    const pct = (n: number) => r.total ? `${(n / r.total) * 100}%` : '0%'

    return (
        <div className="border dark:border-gray-700 rounded-xl p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Plan de cobro</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {r.total} {plan.modalidad === 'mensual' ? 'cuotas mensuales' : 'hitos'} · {fmt(r.montoTotal)}
                    </p>
                    {plan.moneda === 'UF' && <p className="text-xs text-gray-500 dark:text-gray-400">{estimada ? 'UF del día de emisión' : `UF congelada $${ufPlan.toLocaleString('es-CL', { minimumFractionDigits: 2 })}${plan.fecha_uf_pactada ? ` (${formatDate(plan.fecha_uf_pactada)})` : ''}`}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {plan.documento_url && <a href={plan.documento_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-naranja" title="Abrir acuerdo"><ExternalLink size={14} /></a>}
                    <button onClick={() => setEditando(true)} className="text-gray-400 hover:text-naranja" title="Editar plan"><Pencil size={14} /></button>
                </div>
            </div>
            <div>
                <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                    <div className="bg-green-500" style={{ width: pct(r.pagadas) }} />
                    <div className="bg-blue-400" style={{ width: pct(r.facturadas) }} />
                    <div className="bg-red-400" style={{ width: pct(r.atrasadas) }} />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{r.pagadas} pagadas · {r.facturadas} facturadas sin pagar · {r.pendientes} por facturar{r.atrasadas ? ` (${r.atrasadas} atrasadas)` : ''}</p>
            </div>
            <div className="divide-y dark:divide-gray-700 max-h-64 overflow-y-auto">
                {plan.cuotas.map(c => {
                    const f: FacturaLite | undefined = c.factura_id ? facturasPorId.get(String(c.factura_id)) : undefined
                    const e = estadoCuota(c, f, hoy)
                    const { clp, estimada: est } = montoCLPCuota(c, plan, ufActual)
                    return (
                        <div key={c.id} className="flex items-center gap-2 py-1.5 text-xs">
                            <span className="w-8 text-gray-400 tnum">{c.numero}/{plan.cuotas.length}</span>
                            <span className="w-20 text-gray-600 dark:text-gray-300">{formatDate(c.fecha_programada)}</span>
                            <span className="flex-1 tnum text-gray-700 dark:text-gray-200">{fmt(c.monto)}{plan.moneda === 'UF' && clp ? <span className="text-gray-400"> · {est ? '~' : ''}${clp.toLocaleString('es-CL')}</span> : null}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${BADGE[e]}`}>{ESTADO_CUOTA_LABEL[e]}</span>
                            {c.factura_id ? (
                                <span className="inline-flex items-center gap-1 w-24 justify-end">
                                    <span className="font-mono text-gray-500">#{f?.folio || f?.numero_factura || c.factura_id}</span>
                                    <button onClick={() => void desvincularFactura(c)} className="text-gray-300 hover:text-red-500" title="Desvincular"><Unlink size={12} /></button>
                                </span>
                            ) : c.omitida ? <span className="w-24" /> : (
                                <select value="" onChange={ev => { const fa = facturasPorId.get(ev.target.value); if (fa) void vincularFactura(c, fa, plan) }}
                                    className="w-24 text-[11px] border dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700" title="Vincular una factura ya asociada a este cliente">
                                    <option value="">Vincular…</option>
                                    {candidatas.map(fa => <option key={String(fa.id)} value={String(fa.id)}>#{fa.folio || fa.numero_factura} · {formatDate(fa.fecha_emision)}</option>)}
                                </select>
                            )}
                        </div>
                    )
                })}
            </div>
            {candidatas.length === 0 && r.pendientes > 0 && <p className="text-[11px] text-gray-400">Para vincular, primero asocia las facturas del cliente abajo (o usa la vista Cobranza).</p>}
            {modal}
        </div>
    )
}
