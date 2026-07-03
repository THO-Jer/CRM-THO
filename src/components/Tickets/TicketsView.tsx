import { Download, Plus, Paperclip, History, Trash2 } from 'lucide-react'
import { parseLocalDate } from '../../utils/formatters'
import Paginator, { usePaged } from '../shared/Paginator'
import type { Ticket } from '../../types'

// Formatea el valor del ticket usando uf_dia almacenado para la conversión estable
function fmtValorTicket(t: Ticket): { principal: string; referencia: string | null } {
    if (!t.valor_monto) return { principal: '—', referencia: null }
    if (t.valor_moneda === 'CLP') {
        const clp = `$${Math.round(t.valor_monto).toLocaleString('es-CL')}`
        const ref = t.uf_dia ? `~${(t.valor_monto / t.uf_dia).toFixed(1)} UF` : null
        return { principal: clp, referencia: ref }
    }
    return { principal: `${t.valor_monto} UF`, referencia: null }
}

// % de plazo consumido (fecha_inicio → hoy → fecha_entrega)
function plazoPct(t: Ticket): { pct: number; label: string; color: string } | null {
    const inicioDate = parseLocalDate(t.fecha_inicio)
    const finDate = parseLocalDate(t.fecha_entrega)
    if (!inicioDate || !finDate) return null
    const inicio = inicioDate.getTime()
    const fin = finDate.getTime()
    const hoy = Date.now()
    if (fin <= inicio) return null
    const pct = Math.round(((hoy - inicio) / (fin - inicio)) * 100)
    const capped = Math.min(pct, 100)
    const label = pct > 100 ? `Vencido (${pct}%)` : `${pct}%`
    const color = pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-naranja' : pct > 60 ? 'bg-yellow-400' : 'bg-verde'
    return { pct: capped, label, color }
}

interface TicketsViewProps {
    tickets: Ticket[]
    onAdd: () => void
    onEdit: (t: Ticket) => void
    onDelete: (id: string) => void
    onExport: () => void
    onHistory: (tabla: string, id: string, nombre: string) => void
    onClose?: (t: Ticket) => void
    onFiles?: (tabla: string, id: string, nombre: string) => void
    onDetail?: (t: Ticket) => void
    onOrgDetail?: (org: string) => void
}

export default function TicketsView({ tickets, onAdd, onEdit, onDelete, onExport, onHistory, onClose, onFiles, onDetail, onOrgDetail }: TicketsViewProps) {
    void onEdit
    const pag = usePaged(tickets)
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="text-2xl font-bold dark:text-gray-100">Tickets</h2>
                <div className="flex space-x-3">
                    <button onClick={onExport} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm"><Download size={14} /> CSV</button>
                    <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap"><Plus size={14} strokeWidth={2.4} /> Nuevo</button>
                </div>
            </div>

            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ticket</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fase</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Plazo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entrega</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {tickets.length === 0 ? <tr><td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</td></tr> : pag.items.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition" onClick={() => onDetail && onDetail(t)}>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100" onClick={e => { e.stopPropagation(); onOrgDetail && onOrgDetail(t.organizacion) }}><span className="hover:text-naranja transition cursor-pointer">{t.organizacion}</span></td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{t.ticket}</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{(() => { const v = fmtValorTicket(t); return <span>{v.principal}{v.referencia && <span className="text-xs text-gray-400 ml-1">{v.referencia}</span>}</span> })()}</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{t.fase_actual}</td>
                                <td className="px-6 py-4">{(() => { const p = plazoPct(t); return p ? <div className="flex items-center gap-2"><div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-2"><div className={`${p.color} h-2 rounded-full`} style={{ width: `${p.pct}%` }} /></div><span className="text-xs dark:text-gray-400 whitespace-nowrap">{p.label}</span></div> : <span className="text-xs text-gray-400">Sin plazo</span> })()}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{t.fecha_entrega}</td>
                                <td className="px-6 py-4 text-right text-sm" onClick={e => e.stopPropagation()}>
                                    <div className="inline-flex items-center gap-1">
                                        <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Archivos" aria-label="Archivos"><Paperclip size={14} /></button>
                                        <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Historial" aria-label="Historial"><History size={14} /></button>
                                        <button onClick={() => onClose && onClose(t)} className="text-verde text-xs px-1.5">Finalizar</button>
                                        <button onClick={() => onDelete(t.id)} className="p-1.5 rounded text-red-400 hover:text-red-600" title="Eliminar" aria-label="Eliminar"><Trash2 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="md:hidden space-y-3">
                {tickets.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : pag.items.map(t => (
                    <div key={t.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition" onClick={() => onDetail && onDetail(t)}>
                        <div className="flex justify-between items-start mb-2">
                            <div><h3 className="font-bold dark:text-gray-100 hover:text-naranja cursor-pointer" onClick={e => { e.stopPropagation(); onOrgDetail && onOrgDetail(t.organizacion) }}>{t.organizacion}</h3><p className="text-sm text-gray-500 dark:text-gray-400">{t.ticket}</p></div>
                            {t.valor_monto && (() => { const v = fmtValorTicket(t); return <div className="text-right"><span className="text-sm font-medium text-verde">{v.principal}</span>{v.referencia && <p className="text-[10px] text-gray-400">{v.referencia}</p>}</div> })()}
                        </div>
                        <div className="flex items-center gap-3 mb-2 text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{t.fase_actual}</span>
                            {(() => { const p = plazoPct(t); return p ? <div className="flex items-center flex-1"><div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`${p.color} h-1.5 rounded-full`} style={{ width: `${p.pct}%` }} /></div><span className="text-xs ml-2 dark:text-gray-400 whitespace-nowrap">{p.label}</span></div> : <span className="text-xs text-gray-400 flex-1">Sin plazo</span> })()}
                            <span className="text-xs text-gray-400">{t.fecha_entrega}</span>
                        </div>
                        <div className="flex gap-2 pt-2 border-t dark:border-gray-700" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition" aria-label="Archivos"><Paperclip size={14} /></button>
                            <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition" aria-label="Historial"><History size={14} /></button>
                            <button onClick={() => onClose && onClose(t)} className="flex-1 text-xs py-1.5 text-verde hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition">Finalizar</button>
                            <button onClick={() => onDelete(t.id)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition" aria-label="Eliminar"><Trash2 size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>

            <Paginator {...pag.controls} />
        </div>
    )
}
