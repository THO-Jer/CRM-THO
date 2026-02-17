import { useState } from 'react'
import MetricCard from '../shared/MetricCard'

export default function KeyAccountsView({keyAccounts, onAdd, onEdit, onDelete, onExport, onHistory, onRenew, onCancel, onFiles, onDetail}) {
    const totalMRR = keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="text-2xl font-bold">Key Accounts</h2>
                <div className="flex space-x-3">
                    <button onClick={onExport} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">📥 CSV</button>
                    <button onClick={onAdd} className="px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap">+ Nuevo</button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard title="MRR" value={`${Math.round(totalMRR)} UF/mes`} subtitle={`~$${Math.round(totalMRR * 38000).toLocaleString()}`} color="verde" />
                <MetricCard title="Clientes" value={keyAccounts.length} subtitle="Activos" color="azul" />
            </div>
            
            {/* DESKTOP: Tabla */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Servicio</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">UF/mes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Renovación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salud</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {keyAccounts.length === 0 ? <tr><td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">Sin datos</td></tr> : keyAccounts.map(ka => (
                            <tr key={ka.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium cursor-pointer hover:text-naranja transition" onClick={() => onDetail && onDetail(ka)}>{ka.organizacion}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{ka.servicio}</td>
                                <td className="px-6 py-4 text-sm">{ka.uf_mes} UF</td>
                                <td className="px-6 py-4 text-sm">{ka.renovacion || '-'}</td>
                                <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${ka.salud === 'Excelente' ? 'bg-green-100 text-green-800' : ka.salud === 'Buena' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{ka.salud || '-'}</span></td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={() => onEdit(ka)} className="text-azul">Editar</button>
                                    <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="text-gray-700">📎</button>
                                    <button onClick={() => onRenew && onRenew(ka)} className="text-verde">Renovar</button>
                                    <button onClick={() => onCancel && onCancel(ka)} className="text-naranja">Cancelar</button>
                                    <button onClick={() => onHistory('key_accounts', ka.id, ka.organizacion)} className="text-gray-700">Historial</button>
                                    <button onClick={() => onDelete(ka.id)} className="text-red-600">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* MOBILE: Cards */}
            <div className="md:hidden space-y-4">
                {keyAccounts.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center text-sm text-gray-500">Sin datos</div>
                ) : keyAccounts.map(ka => (
                    <div key={ka.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg">{ka.organizacion}</h3>
                                <p className="text-sm text-gray-600">{ka.servicio}</p>
                            </div>
                            <span className="text-sm font-medium text-verde">{ka.uf_mes} UF/mes</span>
                        </div>
                        
                        <div className="space-y-2 mb-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Renovación:</span>
                                <span className="font-medium">{ka.renovacion || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Salud:</span>
                                <span className={`px-2 py-1 text-xs rounded-full ${ka.salud === 'Excelente' ? 'bg-green-100 text-green-800' : ka.salud === 'Buena' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {ka.salud || '-'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-3 border-t">
                            <button onClick={() => onEdit(ka)} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                            <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                            <button onClick={() => onRenew && onRenew(ka)} className="flex-1 px-3 py-2 text-sm bg-green-50 text-verde rounded">Renovar</button>
                            <button onClick={() => onCancel && onCancel(ka)} className="flex-1 px-3 py-2 text-sm bg-orange-50 text-naranja rounded text-xs">Cancelar</button>
                            <button onClick={() => onHistory('key_accounts', ka.id, ka.organizacion)} className="px-3 py-2 text-sm bg-gray-50 rounded text-xs">Historial</button>
                            <button onClick={() => onDelete(ka.id)} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
