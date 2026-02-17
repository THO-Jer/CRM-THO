import { useState } from 'react'

export default function TicketsView({tickets, onAdd, onEdit, onDelete, onExport, onHistory, onClose, onFiles, onDetail}) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="text-2xl font-bold">Tickets</h2>
                <div className="flex space-x-3">
                    <button onClick={onExport} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">📥 CSV</button>
                    <button onClick={onAdd} className="px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap">+ Nuevo</button>
                </div>
            </div>
            
            {/* DESKTOP: Tabla */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fase</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avance</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entrega</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {tickets.length === 0 ? <tr><td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">Sin datos</td></tr> : tickets.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium cursor-pointer hover:text-naranja transition" onClick={() => onDetail && onDetail(t)}>{t.organizacion}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{t.ticket}</td>
                                <td className="px-6 py-4 text-sm text-gray-700">
                                    {t.valor_monto ? (
                                        <span className="font-medium">
                                            {t.valor_moneda === 'CLP' ? `$${Math.round(t.valor_monto).toLocaleString('es-CL')}` : `${t.valor_monto} UF`}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm">{t.fase_actual}</td>
                                <td className="px-6 py-4"><div className="flex items-center"><div className="w-16 bg-gray-200 rounded-full h-2 mr-2"><div className="color-naranja h-2 rounded-full" style={{ width: `${t.porcentaje_avance || 0}%` }}></div></div><span className="text-xs">{t.porcentaje_avance || 0}%</span></div></td>
                                <td className="px-6 py-4 text-sm text-gray-500">{t.fecha_entrega}</td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={() => onEdit(t)} className="text-azul">Editar</button>
                                    <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="text-gray-700">📎</button>
                                    <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="text-gray-700">Historial</button>
                                    <button onClick={() => onClose && onClose(t)} className="text-verde">Finalizar</button>
                                    <button onClick={() => onDelete(t.id)} className="text-red-600">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* MOBILE: Cards */}
            <div className="md:hidden space-y-4">
                {tickets.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center text-sm text-gray-500">Sin datos</div>
                ) : tickets.map(t => (
                    <div key={t.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg">{t.organizacion}</h3>
                                <p className="text-sm text-gray-600">{t.ticket}</p>
                            </div>
                            {t.valor_monto && (
                                <span className="text-sm font-medium text-verde">
                                    {t.valor_moneda === 'CLP' ? `$${Math.round(t.valor_monto).toLocaleString('es-CL')}` : `${t.valor_monto} UF`}
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-2 mb-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Fase:</span>
                                <span className="font-medium">{t.fase_actual}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Avance:</span>
                                <div className="flex items-center">
                                    <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                                        <div className="color-naranja h-2 rounded-full" style={{ width: `${t.porcentaje_avance || 0}%` }}></div>
                                    </div>
                                    <span className="text-xs">{t.porcentaje_avance || 0}%</span>
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Entrega:</span>
                                <span>{t.fecha_entrega}</span>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-3 border-t">
                            <button onClick={() => onEdit(t)} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                            <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                            <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded text-xs">Historial</button>
                            <button onClick={() => onClose && onClose(t)} className="flex-1 px-3 py-2 text-sm bg-green-50 text-verde rounded">Finalizar</button>
                            <button onClick={() => onDelete(t.id)} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
