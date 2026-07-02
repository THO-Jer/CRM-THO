import { useState } from 'react'
import { Download, Plus, Paperclip, History, Trash2 } from 'lucide-react'
import MetricCard from '../shared/MetricCard'
import type { Cerrado, KeyAccount } from '../../types'

interface CerradosViewProps {
    cerrados: Cerrado[]
    onAdd: () => void
    onEdit: (c: Cerrado) => void
    onDelete: (id: string) => void
    onExport: () => void
    onHistory: (tabla: string, id: string, nombre: string) => void
    onConvertClosed?: (c: Cerrado) => void
    onFiles?: (tabla: string, id: string, nombre: string) => void
    onDetail?: (c: Cerrado) => void
    keyAccounts?: KeyAccount[]
}

export default function CerradosView({ cerrados, onAdd, onEdit, onDelete, onExport, onHistory, onConvertClosed, onFiles, onDetail, keyAccounts = [] }: CerradosViewProps) {
    const [filtroAño, setFiltroAño] = useState('todos')
    const años = [...new Set(cerrados.map(c => new Date(c.fecha_cierre).getFullYear()))].sort((a, b) => b - a)
    const cerradosFiltrados = filtroAño === 'todos' ? cerrados : cerrados.filter(c => new Date(c.fecha_cierre).getFullYear() === parseInt(filtroAño))

    const activeServicesFor = (org: string) => {
        const name = (org || '').trim().toLowerCase()
        return keyAccounts.filter(ka => (ka.organizacion || '').trim().toLowerCase() === name)
    }

    const ganados = cerradosFiltrados.filter(c => c.estado_final === 'Ganado')
    const valorGanado = ganados.reduce((sum, c) => sum + (parseFloat(String(c.valor)) || 0), 0)

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-2xl font-bold dark:text-gray-100">Historial de Cierres</h2>
                <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                    <select value={filtroAño} onChange={(e) => setFiltroAño(e.target.value)} className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm flex-1 sm:flex-none bg-white dark:bg-gray-700 dark:text-gray-200">
                        <option value="todos">Todos los años ({cerrados.length})</option>
                        {años.map(año => <option key={año} value={año}>{año} ({cerrados.filter(c => new Date(c.fecha_cierre).getFullYear() === año).length})</option>)}
                    </select>
                    <button onClick={onExport} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm"><Download size={14} /> CSV</button>
                    <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap"><Plus size={14} strokeWidth={2.4} /> Agregar</button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard title="Ganado" value={`${Math.round(valorGanado)} UF`} subtitle={`${ganados.length} de ${cerradosFiltrados.length}`} color="verde" />
                <MetricCard title="Conversión" value={`${cerradosFiltrados.length > 0 ? Math.round((ganados.length / cerradosFiltrados.length) * 100) : 0}%`} subtitle={filtroAño === 'todos' ? 'Global' : `Año ${filtroAño}`} color="azul" />
                <MetricCard title="Valor Total" value={`${Math.round(cerradosFiltrados.reduce((s, c) => s + (parseFloat(String(c.valor)) || 0), 0))} UF`} subtitle={filtroAño === 'todos' ? 'Histórico' : `Año ${filtroAño}`} color="naranja" />
            </div>

            {/* DESKTOP */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {cerradosFiltrados.length === 0
                            ? <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos para {filtroAño === 'todos' ? 'mostrar' : `el año ${filtroAño}`}</td></tr>
                            : cerradosFiltrados.map(c => {
                                const activeSvcs = activeServicesFor(c.organizacion)
                                return (
                                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition" onClick={() => onDetail && onDetail(c)}>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-naranja transition">
                                            <div>{c.organizacion}</div>
                                            {c.tipo && <div className="text-xs text-gray-400 dark:text-gray-500 font-normal">{c.tipo}</div>}
                                            {activeSvcs.length > 0 && (
                                                <div className="text-[10px] text-green-600 dark:text-green-400 font-normal mt-0.5">✓ {activeSvcs.map(s => s.servicio).join(', ')} activo{activeSvcs.length > 1 ? 's' : ''}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${c.estado_final === 'Ganado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>{c.estado_final}</span></td>
                                        <td className="px-6 py-4 text-sm dark:text-gray-300">{c.valor} UF</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{c.fecha_cierre}</td>
                                        <td className="px-6 py-4 text-right text-sm" onClick={e => e.stopPropagation()}>
                                            <div className="inline-flex items-center gap-1">
                                                <button onClick={() => onFiles && onFiles('cerrados', c.id, c.organizacion)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Archivos" aria-label="Archivos"><Paperclip size={14} /></button>
                                                <button onClick={() => onHistory('cerrados', c.id, c.organizacion)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Historial" aria-label="Historial"><History size={14} /></button>
                                                {onConvertClosed && <button onClick={() => onConvertClosed(c)} className="text-azul text-xs px-1.5">Reactivar</button>}
                                                <button onClick={() => onDelete(c.id)} className="p-1.5 rounded text-red-400 hover:text-red-600" title="Eliminar" aria-label="Eliminar"><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                    </tbody>
                </table>
            </div>

            {/* MOBILE */}
            <div className="md:hidden space-y-3">
                {cerradosFiltrados.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : cerradosFiltrados.map(c => {
                    const activeSvcs = activeServicesFor(c.organizacion)
                    return (
                        <div key={c.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition" onClick={() => onDetail && onDetail(c)}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold dark:text-gray-100">{c.organizacion}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{c.tipo}</p>
                                    {activeSvcs.length > 0 && (
                                        <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">✓ {activeSvcs.map(s => s.servicio).join(', ')} activo{activeSvcs.length > 1 ? 's' : ''}</p>
                                    )}
                                </div>
                                <span className={`px-2 py-1 text-xs rounded-full ${c.estado_final === 'Ganado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>{c.estado_final}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-3">
                                <span className="text-gray-500 dark:text-gray-400">{c.fecha_cierre}</span>
                                <span className="font-medium dark:text-gray-200">{c.valor} UF</span>
                            </div>
                            <div className="flex gap-2 pt-2 border-t dark:border-gray-700" onClick={e => e.stopPropagation()}>
                                <button onClick={() => onFiles && onFiles('cerrados', c.id, c.organizacion)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition" aria-label="Archivos"><Paperclip size={14} /></button>
                                <button onClick={() => onHistory('cerrados', c.id, c.organizacion)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition" aria-label="Historial"><History size={14} /></button>
                                {onConvertClosed && <button onClick={() => onConvertClosed(c)} className="flex-1 text-xs py-1.5 text-azul hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition">Reactivar</button>}
                                <button onClick={() => onDelete(c.id)} className="flex-1 flex items-center justify-center text-xs py-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition" aria-label="Eliminar"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
