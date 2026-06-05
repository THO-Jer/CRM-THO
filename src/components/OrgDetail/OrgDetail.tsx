import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import useEscapeKey from '../../hooks/useEscapeKey'
import type { KeyAccount, Ticket, Cerrado, Prospecto } from '../../types'

interface FacturaOrg {
    id: number; folio: string | null; numero_factura: string | null
    descripcion: string | null; total_monto_clp: number | null; monto_uf: number | null
    fecha_emision: string | null; fecha_pago: string | null; estado: string; cliente: string | null
}

interface OrgDetailProps {
    org: string
    keyAccounts: KeyAccount[]
    tickets: Ticket[]
    cerrados: Cerrado[]
    prospectos: Prospecto[]
    ufActual: number
    onClose: () => void
    onOpenDetail: (type: 'keyaccount' | 'ticket' | 'cerrado' | 'prospecto', item: KeyAccount | Ticket | Cerrado | Prospecto) => void
}

const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const saludColor = (s: string | null) => {
    if (!s || s === 'Excelente' || s === 'Buena') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    if (s === 'Riesgo') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
}

function autoSalud(ka: KeyAccount): string {
    if (!ka.fin_contrato) return ka.salud || '—'
    const dias = Math.floor((new Date(ka.fin_contrato).getTime() - Date.now()) / 86400000)
    if (dias < 0) return 'Vencido'
    if (dias <= 30) return 'Crítico'
    if (dias <= 60) return 'Riesgo'
    return ka.salud && ka.salud !== 'OK' ? ka.salud : 'Excelente'
}

export default function OrgDetail({ org, keyAccounts, tickets, cerrados, prospectos, ufActual, onClose, onOpenDetail }: OrgDetailProps) {
    useEscapeKey(onClose)
    const [activeTab, setActiveTab] = useState('resumen')
    const [facturas, setFacturas] = useState<FacturaOrg[]>([])
    const [facturasLoading, setFacturasLoading] = useState(false)

    const orgLower = org.toLowerCase().trim()
    const matchOrg = (s: string | null | undefined) => (s || '').toLowerCase().trim().includes(orgLower)

    const orgKAs = useMemo(() => keyAccounts.filter(k => matchOrg(k.organizacion)), [keyAccounts, orgLower])
    const orgTickets = useMemo(() => tickets.filter(t => matchOrg(t.organizacion)), [tickets, orgLower])
    const orgCerrados = useMemo(() => cerrados.filter(c => matchOrg(c.organizacion)), [cerrados, orgLower])
    const orgProspectos = useMemo(() => prospectos.filter(p => matchOrg(p.organizacion)), [prospectos, orgLower])

    const mrr = orgKAs.reduce((s, k) => s + (parseFloat(String(k.uf_mes)) || 0), 0)
    const totalFacturadoUF = facturas.reduce((s, f) => s + (f.monto_uf || 0), 0)
    const totalFacturadoCLP = facturas.reduce((s, f) => s + (f.total_monto_clp || 0), 0)
    const ganados = orgCerrados.filter(c => c.estado_final === 'Ganado')

    useEffect(() => {
        if (activeTab !== 'facturas' || facturas.length > 0) return
        void loadFacturas()
    }, [activeTab])

    const loadFacturas = async () => {
        setFacturasLoading(true)
        try {
            const { data } = await supabase
                .from('facturas_emitidas')
                .select('id, folio, numero_factura, descripcion, total_monto_clp, monto_uf, fecha_emision, fecha_pago, estado, cliente')
                .ilike('cliente', `%${org}%`)
                .order('fecha_emision', { ascending: false })
                .limit(100)
            setFacturas((data || []) as FacturaOrg[])
        } catch (err) { console.error(err) }
        finally { setFacturasLoading(false) }
    }

    const tabs = [
        { id: 'resumen', label: '📊 Resumen' },
        { id: 'ka', label: `🏢 KA (${orgKAs.length})` },
        { id: 'tickets', label: `🎫 Tickets (${orgTickets.length})` },
        { id: 'pipeline', label: `🔭 Pipeline (${orgProspectos.length})` },
        { id: 'historial', label: `📋 Historial (${orgCerrados.length})` },
        { id: 'facturas', label: '💰 Facturas' },
    ]

    const estadoBadge = (e: string) =>
        e === 'Pagada' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        : e === 'Pendiente' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : e === 'Vencida' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-6 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-5 border-b dark:border-gray-700">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Vista 360°</p>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{org}</h2>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {mrr > 0 && (
                                    <span className="text-sm font-medium text-verde">{mrr.toFixed(1)} UF/mes</span>
                                )}
                                {mrr > 0 && (
                                    <span className="text-xs text-gray-400">~${Math.round(mrr * ufActual).toLocaleString('es-CL')}/mes</span>
                                )}
                                {ganados.length > 0 && (
                                    <span className="text-xs text-gray-400">· {ganados.length} deal{ganados.length > 1 ? 's' : ''} ganado{ganados.length > 1 ? 's' : ''}</span>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg ml-4">✕</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b dark:border-gray-700 px-2 overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${activeTab === t.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">

                    {/* RESUMEN */}
                    {activeTab === 'resumen' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'KAs activos', value: orgKAs.length },
                                    { label: 'Tickets', value: orgTickets.length },
                                    { label: 'En pipeline', value: orgProspectos.length },
                                    { label: 'Cerrados', value: orgCerrados.length },
                                ].map(m => (
                                    <div key={m.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">{m.label}</p>
                                        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{m.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* KAs activos resumen */}
                            {orgKAs.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Servicios activos</p>
                                    <div className="space-y-1.5">
                                        {orgKAs.map(ka => (
                                            <div key={ka.id} className="flex items-center justify-between bg-white dark:bg-gray-700 rounded-lg px-3 py-2 border dark:border-gray-600 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('keyaccount', ka)}>
                                                <div>
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{ka.servicio || '—'}</span>
                                                    {ka.fin_contrato && <span className="text-xs text-gray-400 ml-2">hasta {fmtDate(ka.fin_contrato)}</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludColor(autoSalud(ka))}`}>{autoSalud(ka)}</span>
                                                    <span className="text-sm font-semibold text-verde">{ka.uf_mes} UF</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tickets resumen */}
                            {orgTickets.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Tickets recientes</p>
                                    <div className="space-y-1.5">
                                        {orgTickets.slice(0, 3).map(t => (
                                            <div key={t.id} className="flex items-center justify-between bg-white dark:bg-gray-700 rounded-lg px-3 py-2 border dark:border-gray-600 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('ticket', t)}>
                                                <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{t.ticket || t.organizacion}</span>
                                                <span className="text-xs text-gray-400 ml-2 shrink-0">{t.fase_actual || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {orgKAs.length === 0 && orgTickets.length === 0 && orgProspectos.length === 0 && orgCerrados.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-8">Sin datos registrados para esta organización</p>
                            )}
                        </div>
                    )}

                    {/* KA */}
                    {activeTab === 'ka' && (
                        <div className="space-y-2">
                            {orgKAs.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin Key Accounts</p> : orgKAs.map(ka => (
                                <div key={ka.id} className="bg-white dark:bg-gray-700 rounded-xl border dark:border-gray-600 p-4 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('keyaccount', ka)}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{ka.servicio || '—'}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {ka.inicio_contrato ? fmtDate(ka.inicio_contrato) : '—'} → {ka.fin_contrato ? fmtDate(ka.fin_contrato) : '—'}
                                            </p>
                                            {ka.renovacion && <p className="text-xs text-gray-400">Renovación: {ka.renovacion}</p>}
                                        </div>
                                        <div className="text-right ml-4 shrink-0">
                                            <p className="text-lg font-bold text-verde">{ka.uf_mes} UF</p>
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludColor(autoSalud(ka))}`}>{autoSalud(ka)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* TICKETS */}
                    {activeTab === 'tickets' && (
                        <div className="space-y-2">
                            {orgTickets.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin tickets</p> : orgTickets.map(t => (
                                <div key={t.id} className="bg-white dark:bg-gray-700 rounded-xl border dark:border-gray-600 p-4 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('ticket', t)}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{t.ticket || '—'}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{t.fase_actual || '—'} · Entrega {fmtDate(t.fecha_entrega)}</p>
                                        </div>
                                        {t.valor_monto && (
                                            <span className="text-sm font-semibold text-verde ml-3 shrink-0">
                                                {t.valor_moneda === 'CLP' ? `$${Math.round(t.valor_monto).toLocaleString('es-CL')}` : `${t.valor_monto} UF`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* PIPELINE */}
                    {activeTab === 'pipeline' && (
                        <div className="space-y-2">
                            {orgProspectos.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin prospectos abiertos</p> : orgProspectos.map(p => (
                                <div key={p.id} className="bg-white dark:bg-gray-700 rounded-xl border dark:border-gray-600 p-4 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('prospecto', p)}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">{p.estado}</span>
                                                {p.probabilidad != null && <span className="text-xs text-gray-400">{p.probabilidad}%</span>}
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">{p.tipo || '—'} · {fmtDate(p.fecha_limite)}</p>
                                            {p.proximo_paso && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{p.proximo_paso}</p>}
                                        </div>
                                        {p.valor && <span className="text-sm font-semibold text-verde ml-3 shrink-0">{p.valor} UF</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* HISTORIAL */}
                    {activeTab === 'historial' && (
                        <div className="space-y-2">
                            {orgCerrados.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin historial</p> : orgCerrados.map(c => (
                                <div key={c.id} className="bg-white dark:bg-gray-700 rounded-xl border dark:border-gray-600 p-4 cursor-pointer hover:border-naranja/40 transition" onClick={() => onOpenDetail('cerrado', c)}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${c.estado_final === 'Ganado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>{c.estado_final}</span>
                                                {c.tipo && <span className="text-xs text-gray-400">{c.tipo}</span>}
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">Cierre: {fmtDate(c.fecha_cierre)}</p>
                                            {c.motivo_cierre && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{c.motivo_cierre}</p>}
                                        </div>
                                        {c.valor && <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 ml-3 shrink-0">{c.valor} UF</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* FACTURAS */}
                    {activeTab === 'facturas' && (
                        <div className="space-y-3">
                            {facturasLoading && <p className="text-xs text-gray-400 text-center py-4 animate-pulse">Cargando facturas…</p>}
                            {!facturasLoading && facturas.length > 0 && (
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Facturas</p>
                                        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{facturas.length}</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Total UF</p>
                                        <p className="text-xl font-bold text-verde">{totalFacturadoUF.toFixed(1)}</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Pagadas</p>
                                        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{facturas.filter(f => f.estado === 'Pagada').length}</p>
                                    </div>
                                </div>
                            )}
                            {!facturasLoading && totalFacturadoCLP > 0 && (
                                <p className="text-xs text-gray-400 text-center -mt-1">Total CLP: ${Math.round(totalFacturadoCLP).toLocaleString('es-CL')}</p>
                            )}
                            {!facturasLoading && facturas.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-8">Sin facturas emitidas para este cliente</p>
                            )}
                            {!facturasLoading && (
                                <div className="space-y-2">
                                    {facturas.map(f => (
                                        <div key={f.id} className="flex items-center gap-3 bg-white dark:bg-gray-700/50 rounded-lg px-3 py-2.5 border dark:border-gray-700">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {(f.folio || f.numero_factura) && <span className="text-xs font-mono text-gray-400">#{f.folio || f.numero_factura}</span>}
                                                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${estadoBadge(f.estado)}`}>{f.estado}</span>
                                                </div>
                                                {f.descripcion && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{f.descripcion}</p>}
                                                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(f.fecha_emision)}{f.fecha_pago ? ` · Pagada ${fmtDate(f.fecha_pago)}` : ''}</p>
                                            </div>
                                            <span className="text-sm font-semibold text-verde whitespace-nowrap">
                                                {f.monto_uf ? `${f.monto_uf} UF` : f.total_monto_clp ? `$${Math.round(f.total_monto_clp).toLocaleString('es-CL')}` : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
