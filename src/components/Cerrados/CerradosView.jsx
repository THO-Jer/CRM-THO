import { useState } from 'react'
import { formatDate } from '../../utils/formatters'
import MetricCard from '../shared/MetricCard'

export default function CerradosView({cerrados, onAdd, onEdit, onDelete, onExport, onHistory, onConvertClosed, onFiles, onDetail}) {
    const [filtroAño, setFiltroAño] = useState('todos');
    
    // Extraer años únicos de los cierres
    const años = [...new Set(cerrados.map(c => new Date(c.fecha_cierre).getFullYear()))].sort((a, b) => b - a);
    
    // Filtrar por año
    const cerradosFiltrados = filtroAño === 'todos' 
        ? cerrados 
        : cerrados.filter(c => new Date(c.fecha_cierre).getFullYear() === parseInt(filtroAño));
    
    const ganados = cerradosFiltrados.filter(c => c.estado_final === 'Ganado');
    const valorGanado = ganados.reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-2xl font-bold">Historial de Cierres</h2>
                <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                    <select 
                        value={filtroAño} 
                        onChange={(e) => setFiltroAño(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm flex-1 sm:flex-none"
                    >
                        <option value="todos">Todos los años ({cerrados.length})</option>
                        {años.map(año => {
                            const count = cerrados.filter(c => new Date(c.fecha_cierre).getFullYear() === año).length;
                            return <option key={año} value={año}>{año} ({count})</option>;
                        })}
                    </select>
                    <button onClick={onExport} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">📥 CSV</button>
                    <button onClick={onAdd} className="px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap">+ Agregar</button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard title="Ganado" value={`${Math.round(valorGanado)} UF`} subtitle={`${ganados.length} de ${cerradosFiltrados.length}`} color="verde" />
                <MetricCard title="Conversión" value={`${cerradosFiltrados.length > 0 ? Math.round((ganados.length/cerradosFiltrados.length)*100) : 0}%`} subtitle={filtroAño === 'todos' ? 'Global' : `Año ${filtroAño}`} color="azul" />
                <MetricCard title="Valor Total" value={`${Math.round(cerradosFiltrados.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0))} UF`} subtitle={filtroAño === 'todos' ? 'Histórico' : `Año ${filtroAño}`} color="naranja" />
            </div>
            
            {/* DESKTOP: Tabla */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {cerradosFiltrados.length === 0 ? <tr><td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">Sin datos para {filtroAño === 'todos' ? 'mostrar' : `el año ${filtroAño}`}</td></tr> : cerradosFiltrados.map(c => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium cursor-pointer hover:text-naranja transition" onClick={() => onDetail && onDetail(c)}>{c.organizacion}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{c.tipo}</td>
                                <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${c.estado_final === 'Ganado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{c.estado_final}</span></td>
                                <td className="px-6 py-4 text-sm">{c.valor} UF</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{c.fecha_cierre}</td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={() => onEdit(c)} className="text-azul">Editar</button>
                                    <button onClick={() => onFiles && onFiles('cerrados', c.id, c.organizacion)} className="text-gray-700">📎</button>
                                    <button onClick={() => onHistory('cerrados', c.id, c.organizacion)} className="text-gray-700">Historial</button>
                                    {onConvertClosed && (
                                        <button onClick={() => onConvertClosed(c)} className="text-azul">Reactivar</button>
                                    )}
                                    <button onClick={() => onDelete(c.id)} className="text-red-600">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* MOBILE: Cards */}
            <div className="md:hidden space-y-4">
                {cerradosFiltrados.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center text-sm text-gray-500">
                        Sin datos para {filtroAño === 'todos' ? 'mostrar' : `el año ${filtroAño}`}
                    </div>
                ) : cerradosFiltrados.map(c => (
                    <div key={c.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg cursor-pointer hover:text-naranja" onClick={() => onDetail && onDetail(c)}>{c.organizacion}</h3>
                                <p className="text-sm text-gray-600">{c.tipo}</p>
                            </div>
                            <span className={`px-2 py-1 text-xs rounded-full ${c.estado_final === 'Ganado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {c.estado_final}
                            </span>
                        </div>
                        
                        <div className="space-y-2 mb-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Valor:</span>
                                <span className="font-medium">{c.valor} UF</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Fecha:</span>
                                <span>{c.fecha_cierre}</span>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-3 border-t">
                            <button onClick={() => onEdit(c)} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                            <button onClick={() => onFiles && onFiles('cerrados', c.id, c.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                            <button onClick={() => onHistory('cerrados', c.id, c.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded text-xs">Historial</button>
                            {onConvertClosed && (
                                <button onClick={() => onConvertClosed(c)} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded text-xs">Reactivar</button>
                            )}
                            <button onClick={() => onDelete(c.id)} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
