import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Link2, Unlink, Search, Plus, Pencil, EyeOff, Eye, AlertTriangle, ExternalLink, Database } from 'lucide-react'
import useCobros, { type PlanConCuotas } from '../../hooks/useCobros'
import { formatDate, getNombreMes, normalizeSearch, todayYMD } from '../../utils/formatters'
import { tokenSimilarity } from '../../utils/conciliacion'
import {
    estadoCuota, montoCLPCuota, resumenPlan, ufParaCuota, ESTADO_CUOTA_LABEL,
    type CuotaCobro, type EstadoCuota, type FacturaLite, type PlanCobro,
} from '../../utils/cobros'
import PlanCobroModal from './PlanCobroModal'
import { draftDesdePlan, draftInicial, type PlanDraft } from '../../utils/planDraft'
import type { Ticket, KeyAccount } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// COBRANZA — la vista del JAF: qué hay que facturar este mes, qué está atrasado,
// qué se facturó y no se ha pagado. Todo sale del plan de cobro de cada
// Ticket/KA cruzado con facturas_emitidas (sin abrir el Word del acuerdo).
// ─────────────────────────────────────────────────────────────────────────────

const BADGE: Record<EstadoCuota, string> = {
    atrasada: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    por_facturar: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    facturada: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    pagada: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    programada: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    omitida: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 line-through',
}

const clpFactura = (f: FacturaLite) => Number(f.total_monto_clp) || Number(f.monto_clp) || 0
const fmtCLP = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
const fmtMonto = (n: number, moneda: string) => moneda === 'UF' ? `${(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF` : fmtCLP(n)

interface Fila { plan: PlanConCuotas; cuota: CuotaCobro; estado: EstadoCuota; clp: number; estimada: boolean; factura?: FacturaLite }

interface Props {
    tickets: Ticket[]
    keyAccounts: KeyAccount[]
    ufActual: number
    userEmail?: string | null
}

export default function CobranzaView({ tickets, keyAccounts, ufActual, userEmail }: Props) {
    const { planes, facturas, loading, error, tablaFaltante, cargar, guardarPlan, vincularFactura, desvincularFactura, toggleOmitida } = useCobros({ userEmail })
    const hoy = todayYMD()
    const [mes, setMes] = useState(hoy.slice(0, 7)) // 'YYYY-MM'
    const [vista, setVista] = useState<'mes' | 'clientes'>('mes')
    const [filtro, setFiltro] = useState<'todas' | EstadoCuota>('todas')
    const [vinculando, setVinculando] = useState<Fila | null>(null)
    const [busqueda, setBusqueda] = useState('')
    const [editor, setEditor] = useState<{ titulo: string; subtitulo?: string; draft: PlanDraft } | null>(null)
    const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

    const facturasPorId = useMemo(() => new Map(facturas.map(f => [String(f.id), f])), [facturas])
    const facturasUsadas = useMemo(() => new Set(planes.flatMap(p => p.cuotas.filter(c => c.factura_id).map(c => String(c.factura_id)))), [planes])

    const filas: Fila[] = useMemo(() => planes.flatMap(plan => plan.cuotas.map(cuota => {
        const factura = cuota.factura_id ? facturasPorId.get(String(cuota.factura_id)) : undefined
        const { clp, estimada } = montoCLPCuota(cuota, plan, ufActual)
        return { plan, cuota, factura, clp: factura ? clpFactura(factura) || clp : clp, estimada: factura ? false : estimada, estado: estadoCuota(cuota, factura, hoy) }
    })), [planes, facturasPorId, ufActual, hoy])

    // Vista "mes": cuotas programadas en el mes elegido + todas las atrasadas (de meses previos, sin facturar)
    const filasMes = useMemo(() => filas
        .filter(f => f.cuota.fecha_programada.slice(0, 7) === mes || (f.estado === 'atrasada' && f.cuota.fecha_programada.slice(0, 7) < mes))
        .sort((a, b) => a.cuota.fecha_programada.localeCompare(b.cuota.fecha_programada) || String(a.plan.organizacion).localeCompare(String(b.plan.organizacion))),
    [filas, mes])
    const filasVisibles = filtro === 'todas' ? filasMes : filasMes.filter(f => f.estado === filtro)

    const kpi = (pred: (f: Fila) => boolean) => { const xs = filas.filter(pred); return { n: xs.length, clp: xs.reduce((s, f) => s + f.clp, 0) } }
    const kPorFacturar = kpi(f => f.estado === 'por_facturar' && f.cuota.fecha_programada.slice(0, 7) === hoy.slice(0, 7))
    const kAtrasadas = kpi(f => f.estado === 'atrasada')
    const kImpagas = kpi(f => f.estado === 'facturada')
    const mesSiguiente = (() => {
        const [y, m] = hoy.slice(0, 7).split('-').map(Number)
        return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    })()
    const kProximo = kpi(f => f.estado === 'programada' && f.cuota.fecha_programada.slice(0, 7) === mesSiguiente)

    // Clientes activos sin plan
    const sinPlan = useMemo(() => {
        const conPlan = new Set(planes.map(p => `${p.entidad_tipo}:${p.entidad_id}`))
        const kas = keyAccounts.filter(k => (k.salud || '').toLowerCase() !== 'cerrado' && !conPlan.has(`key_account:${k.id}`))
            .map(k => ({ tipo: 'key_account' as const, item: k as unknown as Record<string, unknown> }))
        const tks = tickets.filter(t => (t.status || '').toLowerCase() !== 'cerrado' && !conPlan.has(`ticket:${t.id}`))
            .map(t => ({ tipo: 'ticket' as const, item: t as unknown as Record<string, unknown> }))
        return [...kas, ...tks]
    }, [planes, tickets, keyAccounts])

    const moverMes = (delta: number) => {
        const [y, m] = mes.split('-').map(Number)
        const d = new Date(y, m - 1 + delta, 1)
        setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const abrirCrearPlan = (tipo: 'ticket' | 'key_account', item: Record<string, unknown>) => {
        const esKA = tipo === 'key_account'
        setEditor({
            titulo: 'Crear plan de cobro', subtitulo: String(item.organizacion || ''),
            draft: draftInicial({
                entidad_tipo: tipo, entidad_id: String(item.id), organizacion: item.organizacion as string,
                servicio: (esKA ? item.servicio : item.ticket) as string,
                montoCuota: esKA ? (item.uf_mes as number) : (item.valor_monto as number),
                moneda: !esKA && item.valor_moneda === 'CLP' ? 'CLP' : 'UF',
                inicio: (esKA ? item.inicio_contrato : item.fecha_inicio) as string,
                fin: esKA ? item.fin_contrato as string : null,
                fechaUF: (esKA ? item.inicio_contrato : item.fecha_inicio) as string,
            }),
        })
    }
    const abrirEditarPlan = (plan: PlanConCuotas) => setEditor({ titulo: 'Editar plan de cobro', subtitulo: plan.organizacion || '', draft: draftDesdePlan(plan, plan.cuotas) })

    // Candidatas para vincular: facturas no usadas en otra cuota, ordenadas por parecido
    const candidatas = useMemo(() => {
        if (!vinculando) return []
        const { plan, clp, cuota } = vinculando
        const fk = plan.entidad_tipo === 'ticket' ? 'crm_ticket_id' : 'crm_ka_id'
        const q = normalizeSearch(busqueda)
        return facturas
            .filter(f => !facturasUsadas.has(String(f.id)) && !['Anulada', 'Reclamada'].includes(String(f.estado)))
            .filter(f => !q || normalizeSearch(`${f.folio ?? ''} ${f.numero_factura ?? ''} ${f.cliente ?? ''}`).includes(q))
            .map(f => {
                const mismaEntidad = String(f[fk] ?? '') === String(plan.entidad_id)
                const sim = tokenSimilarity(String(f.cliente ?? ''), String(plan.organizacion ?? ''))
                const fc = clpFactura(f)
                const dif = clp > 0 && fc > 0 ? Math.abs(fc - clp) / clp : 1
                const dias = f.fecha_emision ? Math.abs((new Date(f.fecha_emision).getTime() - new Date(cuota.fecha_programada).getTime()) / 86400000) : 999
                const score = (mismaEntidad ? 3 : 0) + sim * 2 + (dif < 0.005 ? 2 : dif < 0.03 ? 1 : 0) + (dias < 20 ? 1 : dias < 45 ? 0.5 : 0)
                return { f, score, dif }
            })
            .filter(x => q ? true : x.score >= 1)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12)
    }, [vinculando, facturas, facturasUsadas, busqueda])

    if (tablaFaltante) return (
        <div className="max-w-xl mx-auto mt-10 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 text-center">
            <Database className="mx-auto text-naranja mb-3" size={28} />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Falta crear las tablas de cobranza</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">Corre una vez el archivo <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">sql/plan-cobros.sql</code> en Supabase → SQL Editor, y luego recarga.</p>
            <button onClick={() => void cargar()} className="mt-4 px-4 py-2 rounded-lg color-naranja text-white text-sm">Reintentar</button>
        </div>
    )

    return (
        <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { t: `Por facturar · ${getNombreMes(Number(hoy.slice(5, 7)) - 1)}`, k: kPorFacturar, c: 'text-amber-600', f: 'por_facturar' as const },
                    { t: 'Atrasadas (meses anteriores)', k: kAtrasadas, c: 'text-red-600', f: 'atrasada' as const },
                    { t: 'Facturado sin pagar', k: kImpagas, c: 'text-blue-600', f: 'facturada' as const },
                    { t: 'Próximo mes', k: kProximo, c: 'text-gray-700 dark:text-gray-200', f: 'programada' as const },
                ].map(x => (
                    <button key={x.t} onClick={() => { setVista('mes'); setFiltro(x.f); setMes(x.f === 'programada' ? mesSiguiente : hoy.slice(0, 7)) }}
                        className="text-left bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition">
                        <div className="text-xs text-gray-500 dark:text-gray-400">{x.t}</div>
                        <div className={`text-xl font-bold tnum mt-1 ${x.c}`}>{fmtCLP(x.k.clp)}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{x.k.n} cuota{x.k.n === 1 ? '' : 's'}</div>
                    </button>
                ))}
            </div>

            {sinPlan.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
                        <AlertTriangle size={15} /> {sinPlan.length} cliente{sinPlan.length === 1 ? '' : 's'} activo{sinPlan.length === 1 ? '' : 's'} sin plan de cobro — cárgalos una vez desde el acuerdo y no habrá que volver al Word
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {sinPlan.map(({ tipo, item }) => (
                            <button key={`${tipo}:${item.id}`} onClick={() => abrirCrearPlan(tipo, item)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 rounded-full hover:border-naranja hover:text-naranja transition">
                                <Plus size={12} /> {String(item.organizacion || 'Sin nombre')} <span className="text-gray-400">· {tipo === 'key_account' ? 'KA' : 'Ticket'}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b dark:border-gray-700">
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-lg">
                        {(['mes', 'clientes'] as const).map(v => (
                            <button key={v} onClick={() => setVista(v)} className={`px-3 py-1 rounded-md text-xs font-medium ${vista === v ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
                                {v === 'mes' ? 'Por mes' : 'Por cliente'}
                            </button>
                        ))}
                    </div>
                    {vista === 'mes' && (<>
                        <div className="flex items-center gap-1">
                            <button onClick={() => moverMes(-1)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
                            <span className="text-sm font-medium w-36 text-center text-gray-800 dark:text-gray-100">{getNombreMes(Number(mes.slice(5, 7)) - 1)} {mes.slice(0, 4)}</span>
                            <button onClick={() => moverMes(1)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {(['todas', 'atrasada', 'por_facturar', 'programada', 'facturada', 'pagada'] as const).map(f => (
                                <button key={f} onClick={() => setFiltro(f)} className={`px-2.5 py-1 rounded-full text-xs border ${filtro === f ? 'border-naranja text-naranja bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                                    {f === 'todas' ? 'Todas' : ESTADO_CUOTA_LABEL[f]}
                                </button>
                            ))}
                        </div>
                    </>)}
                    <span className="ml-auto text-xs text-gray-400">UF hoy: {ufActual ? `$${ufActual.toLocaleString('es-CL', { minimumFractionDigits: 2 })}` : '—'}</span>
                </div>

                {loading && <p className="text-sm text-gray-400 text-center py-10 animate-pulse">Cargando planes de cobro…</p>}
                {error && <p className="text-sm text-red-600 text-center py-6">Error: {error}</p>}

                {/* Vista por mes */}
                {!loading && !error && vista === 'mes' && (
                    filasVisibles.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-10">{planes.length === 0 ? 'Aún no hay planes de cobro. Crea el primero desde la lista de clientes sin plan.' : 'No hay cuotas para este filtro.'}</p>
                        : <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700/40">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Cliente</th>
                                        <th className="px-4 py-2 text-left font-medium">Cuota</th>
                                        <th className="px-4 py-2 text-left font-medium">Fecha</th>
                                        <th className="px-4 py-2 text-right font-medium">Pactado</th>
                                        <th className="px-4 py-2 text-right font-medium">A facturar</th>
                                        <th className="px-4 py-2 text-left font-medium">Estado</th>
                                        <th className="px-4 py-2 text-left font-medium">Factura</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-gray-700">
                                    {filasVisibles.map(fila => <FilaCuota key={fila.cuota.id} fila={fila} total={fila.plan.cuotas.length} ufActual={ufActual}
                                        onVincular={() => { setBusqueda(''); setVinculando(fila) }} onDesvincular={() => void desvincularFactura(fila.cuota)} onOmitir={() => void toggleOmitida(fila.cuota)} />)}
                                </tbody>
                            </table>
                        </div>
                )}

                {/* Vista por cliente */}
                {!loading && !error && vista === 'clientes' && (
                    <div className="divide-y dark:divide-gray-700">
                        {planes.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Aún no hay planes de cobro.</p>}
                        {planes.map(plan => {
                            const r = resumenPlan(plan.cuotas, facturasPorId, hoy)
                            const abierto = abiertos.has(String(plan.id))
                            const pct = (n: number) => r.total ? `${(n / r.total) * 100}%` : '0%'
                            const { uf: ufPlan, estimada } = ufParaCuota(plan, ufActual)
                            return (
                                <div key={plan.id}>
                                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                                        <button onClick={() => setAbiertos(prev => { const s = new Set(prev); if (s.has(String(plan.id))) s.delete(String(plan.id)); else s.add(String(plan.id)); return s })} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                                            {abierto ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{plan.organizacion}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    {plan.entidad_tipo === 'key_account' ? 'KA' : 'Ticket'} · {plan.servicio || '—'} · {plan.modalidad === 'mensual' ? 'mensual' : 'hitos'} · {fmtMonto(r.montoTotal, plan.moneda)}
                                                    {plan.moneda === 'UF' && ufPlan > 0 && <> · UF {estimada ? 'del día de emisión' : `congelada $${ufPlan.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`}</>}
                                                </div>
                                            </div>
                                        </button>
                                        <div className="w-60">
                                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                                                <div className="bg-green-500" style={{ width: pct(r.pagadas) }} />
                                                <div className="bg-blue-400" style={{ width: pct(r.facturadas) }} />
                                                <div className="bg-red-400" style={{ width: pct(r.atrasadas) }} />
                                            </div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 tnum">{r.pagadas} pagadas · {r.facturadas} facturadas · {r.pendientes} por facturar{r.atrasadas ? ` (${r.atrasadas} atrasadas)` : ''}</div>
                                        </div>
                                        {plan.documento_url && <a href={plan.documento_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-naranja" title="Abrir acuerdo"><ExternalLink size={15} /></a>}
                                        <button onClick={() => abrirEditarPlan(plan)} className="text-gray-400 hover:text-naranja" title="Editar plan"><Pencil size={15} /></button>
                                    </div>
                                    {abierto && (
                                        <table className="min-w-full text-sm mb-2">
                                            <tbody className="divide-y dark:divide-gray-700/60">
                                                {filas.filter(f => f.plan.id === plan.id).sort((a, b) => a.cuota.numero - b.cuota.numero).map(fila =>
                                                    <FilaCuota key={fila.cuota.id} fila={fila} total={plan.cuotas.length} ufActual={ufActual} compacta
                                                        onVincular={() => { setBusqueda(''); setVinculando(fila) }} onDesvincular={() => void desvincularFactura(fila.cuota)} onOmitir={() => void toggleOmitida(fila.cuota)} />)}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Modal vincular factura */}
            {vinculando && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setVinculando(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Vincular factura</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{vinculando.plan.organizacion} · cuota {vinculando.cuota.numero} · {formatDate(vinculando.cuota.fecha_programada)} · {fmtCLP(vinculando.clp)}{vinculando.estimada ? ' (estimado)' : ''}</p>
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por folio o cliente…" className="w-full pl-8 pr-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-1.5">
                            {candidatas.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No hay facturas sugeridas. Busca por folio o cliente, o importa primero las facturas del SII.</p>}
                            {candidatas.map(({ f, dif }) => (
                                <button key={String(f.id)} onClick={() => { void vincularFactura(vinculando.cuota, f, vinculando.plan as PlanCobro); setVinculando(null) }}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border dark:border-gray-700 hover:border-naranja text-left transition">
                                    <span className="text-xs font-mono text-gray-500">#{f.folio || f.numero_factura || f.id}</span>
                                    <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-200">{f.cliente || '—'}</span>
                                    <span className="text-xs text-gray-500">{formatDate(f.fecha_emision)}</span>
                                    <span className={`text-sm tnum font-medium ${dif < 0.005 ? 'text-verde' : 'text-gray-700 dark:text-gray-200'}`}>{fmtCLP(clpFactura(f))}</span>
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end"><button onClick={() => setVinculando(null)} className="px-4 py-2 rounded-lg border dark:border-gray-600 text-sm">Cerrar</button></div>
                    </div>
                </div>
            )}

            {editor && (
                <PlanCobroModal titulo={editor.titulo} subtitulo={editor.subtitulo} inicial={editor.draft} ufHoy={ufActual}
                    onGuardar={(plan, cuotas) => guardarPlan(plan, cuotas)} onClose={() => setEditor(null)} />
            )}
        </div>
    )
}

function FilaCuota({ fila, total, ufActual, compacta, onVincular, onDesvincular, onOmitir }: {
    fila: Fila; total: number; ufActual: number; compacta?: boolean
    onVincular: () => void; onDesvincular: () => void; onOmitir: () => void
}) {
    const { plan, cuota, estado, clp, estimada, factura } = fila
    const { uf } = ufParaCuota(plan, ufActual)
    return (
        <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${cuota.omitida ? 'opacity-60' : ''}`}>
            {!compacta && (
                <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{plan.organizacion}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[16rem]">{plan.servicio}</div>
                </td>
            )}
            <td className={`${compacta ? 'pl-11' : 'px-4'} py-2.5 text-gray-600 dark:text-gray-300 tnum whitespace-nowrap`} title={cuota.glosa || ''}>{cuota.numero}/{total}{plan.modalidad === 'hitos' && cuota.glosa ? <span className="ml-1 text-xs text-gray-400">{cuota.glosa}</span> : null}</td>
            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(cuota.fecha_programada)}</td>
            <td className="px-4 py-2.5 text-right tnum text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtMonto(cuota.monto, plan.moneda)}</td>
            <td className="px-4 py-2.5 text-right tnum whitespace-nowrap" title={plan.moneda === 'UF' && !factura ? (estimada ? 'Estimado con la UF de hoy (se facturará con la UF del día de emisión)' : `UF congelada: $${uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`) : ''}>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{estimada ? '~' : ''}{fmtCLP(clp)}</span>
            </td>
            <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[estado]}`}>{ESTADO_CUOTA_LABEL[estado]}</span></td>
            <td className="px-4 py-2.5 whitespace-nowrap">
                {factura || cuota.factura_id ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">#{factura?.folio || factura?.numero_factura || cuota.factura_id}</span>
                        {factura?.fecha_pago && <span className="text-xs text-gray-400">pagada {formatDate(factura.fecha_pago)}</span>}
                        <button onClick={onDesvincular} className="text-gray-300 hover:text-red-500" title="Desvincular factura"><Unlink size={13} /></button>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-2">
                        {!cuota.omitida && <button onClick={onVincular} className="inline-flex items-center gap-1 text-xs text-naranja hover:underline"><Link2 size={13} /> Vincular</button>}
                        <button onClick={onOmitir} className="text-gray-300 hover:text-gray-600" title={cuota.omitida ? 'Volver a cobrar esta cuota' : 'Marcar como no cobrable (omitir)'}>{cuota.omitida ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                    </span>
                )}
            </td>
        </tr>
    )
}
