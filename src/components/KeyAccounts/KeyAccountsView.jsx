import { useMemo } from 'react'
import MetricCard from '../shared/MetricCard'

export default function KeyAccountsView({keyAccounts, onAdd, onEdit, onDelete, onExport, onHistory, onRenew, onCancel, onFiles, onDetail}) {
    const totalMRR = keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);
    const saludBadge = (s) => s === 'Excelente' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : s === 'Buena' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : s === 'Riesgo' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    
    // Group KAs by organization
    const grouped = useMemo(() => {
        const map = {};
        keyAccounts.forEach(ka => {
            const key = (ka.organizacion || '').trim().toLowerCase();
            if (!map[key]) map[key] = { org: ka.organizacion, services: [] };
            map[key].services.push(ka);
        });
        return Object.values(map).sort((a, b) => a.org.localeCompare(b.org));
    }, [keyAccounts]);

    const uniqueOrgs = grouped.length;
    
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
                <MetricCard title="Clientes" value={uniqueOrgs} subtitle={`${keyAccounts.length} servicio${keyAccounts.length !== 1 ? 's' : ''} activo${keyAccounts.length !== 1 ? 's' : ''}`} color="azul" />
            </div>
            
            {/* DESKTOP: Grouped cards */}
            <div className="hidden md:block space-y-4">
                {grouped.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : grouped.map(group => (
                    <div key={group.org} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        {/* Org header */}
                        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition" onClick={() => onDetail && onDetail(group.services[0])}>
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-gray-900 dark:text-gray-100 hover:text-naranja transition">{group.org}</h3>
                                {group.services.length > 1 && (
                                    <span className="text-[10px] px-2 py-0.5 bg-naranja/10 text-naranja rounded-full font-medium">{group.services.length} servicios</span>
                                )}
                            </div>
                            <div className="text-sm font-medium text-verde">
                                {Math.round(group.services.reduce((s, ka) => s + (parseFloat(ka.uf_mes) || 0), 0))} UF/mes
                            </div>
                        </div>
                        {/* Service rows */}
                        <div className="divide-y dark:divide-gray-700/50">
                            {group.services.map(ka => (
                                <div key={ka.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{ka.servicio}</span>
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludBadge(ka.salud)}`}>{ka.salud || '-'}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                            {ka.inicio_contrato && `Desde ${ka.inicio_contrato}`}
                                            {ka.fin_contrato && ` · Hasta ${ka.fin_contrato}`}
                                            {ka.renovacion && ka.renovacion !== 'Por definir' && ` · ${ka.renovacion}`}
                                        </div>
                                    </div>
                                    <span className="text-sm dark:text-gray-300 font-medium whitespace-nowrap">{ka.uf_mes} UF</span>
                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                                        <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm">📎</button>
                                        <button onClick={() => onRenew && onRenew(ka)} className="p-1 text-verde hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition text-xs">Renovar</button>
                                        <button onClick={() => onCancel && onCancel(ka)} className="p-1 text-naranja hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition text-xs">Cancelar</button>
                                        <button onClick={() => onHistory('key_accounts', ka.id, `${ka.organizacion} - ${ka.servicio}`)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm">🕘</button>
                                        <button onClick={() => onDelete(ka.id)} className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition text-sm">🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* MOBILE */}
            <div className="md:hidden space-y-4">
                {grouped.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : grouped.map(group => (
                    <div key={group.org} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <div className="p-4 border-b dark:border-gray-700 cursor-pointer" onClick={() => onDetail && onDetail(group.services[0])}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold dark:text-gray-100">{group.org}</h3>
                                    {group.services.length > 1 && <span className="text-[10px] px-2 py-0.5 bg-naranja/10 text-naranja rounded-full font-medium">{group.services.length} servicios</span>}
                                </div>
                                <span className="text-sm font-medium text-verde">{Math.round(group.services.reduce((s, ka) => s + (parseFloat(ka.uf_mes) || 0), 0))} UF/mes</span>
                            </div>
                        </div>
                        {group.services.map(ka => (
                            <div key={ka.id} className="p-3 border-b last:border-b-0 dark:border-gray-700/50">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium dark:text-gray-200">{ka.servicio}</span>
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludBadge(ka.salud)}`}>{ka.salud || '-'}</span>
                                    </div>
                                    <span className="text-sm dark:text-gray-300">{ka.uf_mes} UF</span>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => onFiles && onFiles('key_accounts', ka.id, ka.organizacion)} className="flex-1 text-xs py-1 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition">📎</button>
                                    <button onClick={() => onRenew && onRenew(ka)} className="flex-1 text-xs py-1 text-verde hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition">Renovar</button>
                                    <button onClick={() => onCancel && onCancel(ka)} className="flex-1 text-xs py-1 text-naranja hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition">Cancelar</button>
                                    <button onClick={() => onDelete(ka.id)} className="flex-1 text-xs py-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
