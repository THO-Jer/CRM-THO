import MetricCard from '../shared/MetricCard'

export default function KeyAccountsView({keyAccounts, onAdd, onEdit, onDelete, onExport, onHistory, onRenew, onCancel, onFiles, onDetail}) {
    const totalMRR = keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);
    const saludBadge = (s) => s === 'Excelente' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : s === 'Buena' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : s === 'Riesgo' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="text-2xl font-bold dark:text-gray-100">Key Accounts</h2>
                <div className="flex space-x-3">
                    <button onClick={onExport} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm">📥 CSV</button>
                    <button onClick={onAdd} className="px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap">+ Nuevo</button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard title="MRR" value={`${Math.round(totalMRR)} UF/mes`} subtitle={`~$${Math.round(totalMRR * 38000).toLocaleString()}`} color="verde" />
                <MetricCard title="Clientes" value={keyAccounts.length} subtitle="Activos" color="azul" />
            </div>
            
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Servicio</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">UF/mes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Renovación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salud</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {keyAccounts.length === 0 ? <tr><td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</td></tr> : keyAccounts.map(ka => (
                            <tr key={ka.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition" onClick={() => onDetail && onDetail(ka)}>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-naranja transition">{ka.organizacion}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{ka.servicio}</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{ka.uf_mes} UF</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{ka.renovacion || '-'}</td>
                                <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${saludBadge(ka.salud)}`}>{ka.salud || '-'}</span></td>
                                <td className="px-6 py-4 text-right text-sm space-x-2" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700">📎</button>
                                    <button onClick={() => onRenew && onRenew(ka)} className="text-verde text-xs">Renovar</button>
                                    <button onClick={() => onCancel && onCancel(ka)} className="text-naranja text-xs">Cancelar</button>
                                    <button onClick={() => onHistory('key_accounts', ka.id, ka.organizacion)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700">🕘</button>
                                    <button onClick={() => onDelete(ka.id)} className="text-red-400 hover:text-red-600">🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="md:hidden space-y-3">
                {keyAccounts.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : keyAccounts.map(ka => (
                    <div key={ka.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition" onClick={() => onDetail && onDetail(ka)}>
                        <div className="flex justify-between items-start mb-2">
                            <div><h3 className="font-bold dark:text-gray-100">{ka.organizacion}</h3><p className="text-sm text-gray-500 dark:text-gray-400">{ka.servicio}</p></div>
                            <span className="text-sm font-medium text-verde">{ka.uf_mes} UF/mes</span>
                        </div>
                        <div className="flex items-center gap-3 mb-2 text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{ka.renovacion || '-'}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${saludBadge(ka.salud)}`}>{ka.salud || '-'}</span>
                        </div>
                        <div className="flex gap-2 pt-2 border-t dark:border-gray-700" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="flex-1 text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition">📎</button>
                            <button onClick={() => onRenew && onRenew(ka)} className="flex-1 text-xs py-1.5 text-verde hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition">Renovar</button>
                            <button onClick={() => onCancel && onCancel(ka)} className="flex-1 text-xs py-1.5 text-naranja hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition">Cancelar</button>
                            <button onClick={() => onHistory('key_accounts', ka.id, ka.organizacion)} className="flex-1 text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition">🕘</button>
                            <button onClick={() => onDelete(ka.id)} className="flex-1 text-xs py-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition">🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
