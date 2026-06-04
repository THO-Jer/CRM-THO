import { useMemo } from 'react'
import MetricCard from '../shared/MetricCard'
import type { KeyAccount } from '../../types'

// Calcula salud automáticamente desde fin_contrato (para display, no sobreescribe BD)
function autoSalud(ka: KeyAccount): string {
    if (!ka.fin_contrato) return ka.salud || 'Sin fecha'
    const hoy = new Date()
    const fin = new Date(ka.fin_contrato)
    const dias = Math.floor((fin.getTime() - hoy.getTime()) / 86400000)
    if (dias < 0) return 'Vencido'
    if (dias <= 30) return 'Crítico'
    if (dias <= 60) return 'Riesgo'
    return ka.salud && ka.salud !== 'OK' ? ka.salud : 'Excelente'
}

interface KeyAccountsViewProps {
    keyAccounts: KeyAccount[]
    onAdd: () => void
    onEdit: (ka: KeyAccount) => void
    onDelete: (id: string) => void
    onExport: () => void
    onHistory: (tabla: string, id: string, nombre: string) => void
    onRenew?: (ka: KeyAccount) => void
    onCancel?: (ka: KeyAccount) => void
    onFiles?: (tabla: string, id: string, nombre: string) => void
    onDetail?: (ka: KeyAccount) => void
    ufActual?: number
}

interface OrgGroup {
    org: string
    services: KeyAccount[]
}

export default function KeyAccountsView({ keyAccounts, onAdd, onEdit, onDelete, onExport, onHistory, onRenew, onCancel, onFiles, onDetail, ufActual = 38000 }: KeyAccountsViewProps) {
    const totalMRR = keyAccounts.reduce((sum, ka) => sum + (parseFloat(String(ka.uf_mes)) || 0), 0)
    const saludBadge = (s: string) => {
        if (s === 'Excelente' || s === 'Buena') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        if (s === 'Riesgo') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    }

    // Renovaciones próximas (contratos que vencen en ≤60 días)
    const renovacionesProximas = useMemo(() => {
        const hoy = new Date()
        return keyAccounts
            .filter(ka => {
                if (!ka.fin_contrato) return false
                const fin = new Date(ka.fin_contrato)
                const dias = Math.floor((fin.getTime() - hoy.getTime()) / 86400000)
                return dias >= -30 && dias <= 60 // incluye hasta 30 días vencidos
            })
            .sort((a, b) => new Date(a.fin_contrato!).getTime() - new Date(b.fin_contrato!).getTime())
    }, [keyAccounts])

    const grouped = useMemo((): OrgGroup[] => {
        const map: Record<string, OrgGroup> = {}
        keyAccounts.forEach(ka => {
            const key = (ka.organizacion || '').trim().toLowerCase()
            if (!map[key]) map[key] = { org: ka.organizacion, services: [] }
            map[key].services.push(ka)
        })
        return Object.values(map).sort((a, b) => (a.org || '').localeCompare(b.org || '', 'es-CL', { numeric: true }))
    }, [keyAccounts])

    const uniqueOrgs = grouped.length

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
                <MetricCard title="MRR" value={`${Math.round(totalMRR)} UF/mes`} subtitle={`~$${Math.round(totalMRR * (ufActual || 38000)).toLocaleString('es-CL')}`} color="verde" />
                <MetricCard title="Clientes" value={String(uniqueOrgs)} subtitle={`${keyAccounts.length} servicio${keyAccounts.length !== 1 ? 's' : ''} activo${keyAccounts.length !== 1 ? 's' : ''}`} color="azul" />
                {renovacionesProximas.length > 0 && (
                    <MetricCard title="Renovar pronto" value={String(renovacionesProximas.length)} subtitle="contratos a ≤60 días" color="naranja" />
                )}
            </div>

            {/* Alerta de renovaciones próximas */}
            {renovacionesProximas.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-700/40 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                        🔔 Renovaciones próximas
                    </h3>
                    <div className="space-y-2">
                        {renovacionesProximas.map(ka => {
                            const fin = new Date(ka.fin_contrato!)
                            const dias = Math.floor((fin.getTime() - new Date().getTime()) / 86400000)
                            const s = autoSalud(ka)
                            return (
                                <div key={ka.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border dark:border-gray-700">
                                    <div>
                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{ka.organizacion}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{ka.servicio}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {dias < 0 ? `Venció hace ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoy' : `${dias}d`}
                                        </span>
                                        <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${saludBadge(s)}`}>{s}</span>
                                        <span className="text-xs font-medium text-verde">{ka.uf_mes} UF</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* DESKTOP */}
            <div className="hidden md:block space-y-4">
                {grouped.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : grouped.map(group => (
                    <div key={group.org} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition" onClick={() => onDetail && onDetail(group.services[0])}>
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-gray-900 dark:text-gray-100 hover:text-naranja transition">{group.org}</h3>
                                {group.services.length > 1 && (
                                    <span className="text-[10px] px-2 py-0.5 bg-naranja/10 text-naranja rounded-full font-medium">{group.services.length} servicios</span>
                                )}
                            </div>
                            <div className="text-sm font-medium text-verde">
                                {Math.round(group.services.reduce((s, ka) => s + (parseFloat(String(ka.uf_mes)) || 0), 0))} UF/mes
                            </div>
                        </div>
                        <div className="divide-y dark:divide-gray-700/50">
                            {group.services.map(ka => (
                                <div key={ka.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{ka.servicio}</span>
                                            <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludBadge(autoSalud(ka))}`}>{autoSalud(ka)}</span>
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
                                <span className="text-sm font-medium text-verde">{Math.round(group.services.reduce((s, ka) => s + (parseFloat(String(ka.uf_mes)) || 0), 0))} UF/mes</span>
                            </div>
                        </div>
                        {group.services.map(ka => (
                            <div key={ka.id} className="p-3 border-b last:border-b-0 dark:border-gray-700/50">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium dark:text-gray-200">{ka.servicio}</span>
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${saludBadge(autoSalud(ka))}`}>{autoSalud(ka)}</span>
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
    )
}
