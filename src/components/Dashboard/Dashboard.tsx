import { useState, useMemo } from 'react'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../../types'

interface MetricProps {
    title: string
    value: string
    sub?: string
    color?: 'azul' | 'verde' | 'naranja' | 'fucsia' | 'red' | 'gray'
    icon?: string
}

const Metric = ({ title, value, sub, color = 'azul', icon }: MetricProps) => {
    const colors: Record<string, string> = {
        naranja: 'border-naranja text-naranja', verde: 'border-verde text-verde',
        azul: 'border-azul text-azul', fucsia: 'border-fucsia text-fucsia',
        red: 'border-red-500 text-red-500', gray: 'border-gray-400 text-gray-600'
    }
    const c = colors[color] || colors.gray
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 ${c.split(' ')[0]} hover:shadow-md transition`}>
            {icon && <div className="text-lg mb-1">{icon}</div>}
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{title}</div>
            <div className={`text-xl font-bold ${c.split(' ')[1]}`}>{value}</div>
            {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
        </div>
    )
}

interface HealthDetail {
    icon: string
    text: string
    type: 'good' | 'bad' | 'warn' | 'neutral'
}

interface HealthScore {
    score: number
    label: string
    color: string
    emoji: string
    details: HealthDetail[]
}

interface ActionItem {
    priority: number
    icon: string
    text: string
    action: string
    type: string
    id?: string
}

interface PipelineStage {
    key: string
    label: string
    emoji: string
    count: number
    value: number
}

interface ActivityItem {
    id?: string
    kind?: string
    created_at?: string
    icono_mejorado?: string
    titulo_mejorado?: string
    label?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Metrics = Record<string, any>

interface DashboardProps {
    metrics: Metrics
    prospectos: Prospecto[]
    cerrados: Cerrado[]
    tickets: Ticket[]
    keyAccounts: KeyAccount[]
    user: { name?: string; email?: string } | null
    ufActual: number
    monedaPreferida?: string
    setMonedaPreferida?: (m: string) => void
    actividadReciente?: ActivityItem[]
}

export default function Dashboard({ metrics, prospectos, cerrados, tickets, keyAccounts, user, ufActual, actividadReciente }: DashboardProps) {
    const [_expandedSection, setExpandedSection] = useState<string | null>(null)
    void setExpandedSection
    const m: Metrics = metrics || {}

    // ===== HEALTH SCORE: 0-100 composite =====
    const healthScore = useMemo((): HealthScore => {
        let score = 50
        const details: HealthDetail[] = []

        // 1. Pipeline health (0-20 pts)
        const pipelineValue = m.pipelineTotal || 0
        const mrrActual = m.mrrActual || 0
        const pipelineRatio = mrrActual > 0 ? pipelineValue / mrrActual : 0
        if (pipelineRatio >= 3) { score += 20; details.push({ icon: '✅', text: `Pipeline sano: ${Math.round(pipelineRatio)}x el MRR`, type: 'good' }) }
        else if (pipelineRatio >= 1.5) { score += 10; details.push({ icon: '🟡', text: `Pipeline aceptable: ${Math.round(pipelineRatio * 10) / 10}x el MRR (ideal: 3x)`, type: 'warn' }) }
        else { score -= 5; details.push({ icon: '🔴', text: `Pipeline bajo: ${Math.round(pipelineRatio * 10) / 10}x el MRR — necesitas más prospectos`, type: 'bad' }) }

        // 2. Conversion momentum (0-15 pts)
        const cerradosEsteMes = m.cerradosEsteMes || 0
        if (cerradosEsteMes >= 2) { score += 15; details.push({ icon: '✅', text: `${cerradosEsteMes} cierres este mes — buen ritmo`, type: 'good' }) }
        else if (cerradosEsteMes >= 1) { score += 8; details.push({ icon: '🟡', text: `${cerradosEsteMes} cierre este mes`, type: 'warn' }) }
        else { score -= 5; details.push({ icon: '⚠️', text: 'Sin cierres este mes', type: 'bad' }) }

        // 3. Revenue trend (-10 to +15 pts)
        const variacion = m.variacionIngresos || 0
        if (variacion > 10) { score += 15; details.push({ icon: '📈', text: `Ingresos creciendo +${Math.round(variacion)}%`, type: 'good' }) }
        else if (variacion >= -5) { score += 5; details.push({ icon: '➡️', text: `Ingresos estables (${variacion > 0 ? '+' : ''}${Math.round(variacion)}%)`, type: 'neutral' }) }
        else { score -= 10; details.push({ icon: '📉', text: `Ingresos cayendo ${Math.round(variacion)}%`, type: 'bad' }) }

        // 4. Key Accounts health (0-15 pts)
        const kaTotal = (keyAccounts || []).length
        const kaRiesgo = (keyAccounts || []).filter(ka => ka.salud === 'Riesgo' || ka.salud === 'Crítico').length
        if (kaTotal > 0 && kaRiesgo === 0) { score += 15; details.push({ icon: '✅', text: `${kaTotal} Key Accounts, todos saludables`, type: 'good' }) }
        else if (kaRiesgo > 0) { score -= kaRiesgo * 5; details.push({ icon: '🔴', text: `${kaRiesgo} Key Account${kaRiesgo > 1 ? 's' : ''} en riesgo`, type: 'bad' }) }
        else { details.push({ icon: '💡', text: 'Sin Key Accounts activos — ¿oportunidad de upsell?', type: 'warn' }) }

        // 5. Pipeline activity (-10 to +10 pts)
        const vencidos = m.prospectosVencidos || 0
        const sinActividad = m.prospectosSinActividad || 0
        if (vencidos === 0 && sinActividad === 0) { score += 10; details.push({ icon: '✅', text: 'Pipeline activo, sin prospectos abandonados', type: 'good' }) }
        else {
            if (vencidos > 0) { score -= vencidos * 3; details.push({ icon: '🔴', text: `${vencidos} prospecto${vencidos > 1 ? 's' : ''} con fecha límite vencida`, type: 'bad' }) }
            if (sinActividad > 0) { score -= sinActividad * 2; details.push({ icon: '🟡', text: `${sinActividad} prospecto${sinActividad > 1 ? 's' : ''} sin actividad reciente`, type: 'warn' }) }
        }

        // 6. Diversification bonus
        const uniqueClients = new Set([
            ...(keyAccounts || []).map(ka => ka.organizacion?.trim().toLowerCase()),
            ...(tickets || []).map(t => t.organizacion?.trim().toLowerCase())
        ].filter(Boolean)).size
        if (uniqueClients >= 5) { score += 5; details.push({ icon: '🌐', text: `${uniqueClients} clientes activos — buena diversificación`, type: 'good' }) }
        else if (uniqueClients >= 3) { score += 2 }
        else if (uniqueClients > 0) { details.push({ icon: '⚠️', text: `Solo ${uniqueClients} cliente${uniqueClients > 1 ? 's' : ''} activo${uniqueClients > 1 ? 's' : ''} — riesgo de concentración`, type: 'warn' }) }

        score = Math.max(0, Math.min(100, score))
        const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Saludable' : score >= 40 ? 'Requiere atención' : 'Crítico'
        const color = score >= 80 ? 'verde' : score >= 60 ? 'azul' : score >= 40 ? 'naranja' : 'red'
        const emoji = score >= 80 ? '🟢' : score >= 60 ? '🔵' : score >= 40 ? '🟡' : '🔴'
        return { score, label, color, emoji, details }
    }, [m, keyAccounts, tickets])

    // ===== ACTIONABLE ITEMS =====
    const actionItems = useMemo((): ActionItem[] => {
        const items: ActionItem[] = []
        const now = new Date()

        if (m.prospectosVencidosDetalle?.length) {
            m.prospectosVencidosDetalle.forEach((p: Prospecto) => items.push({
                priority: 1, icon: '🔴', text: `${p.organizacion} — fecha límite vencida`,
                action: 'Contactar o cerrar', type: 'prospecto'
            }))
        }

        ;(tickets || []).forEach(t => {
            if (t.fecha_entrega) {
                const entrega = new Date(t.fecha_entrega)
                const dias = Math.ceil((entrega.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                if (dias >= 0 && dias <= 7) {
                    items.push({ priority: 2, icon: '⏰', text: `${t.organizacion} — ${t.ticket} entrega en ${dias} día${dias !== 1 ? 's' : ''}`, action: `${t.porcentaje_avance || 0}% avance`, type: 'ticket' })
                }
            }
        })

        if (m.keyAccountsPorRenovarDetalle?.length) {
            m.keyAccountsPorRenovarDetalle.forEach((ka: KeyAccount) => items.push({
                priority: 3, icon: '🔄', text: `${ka.organizacion} — ${ka.servicio} por renovar`,
                action: 'Gestionar renovación', type: 'ka'
            }))
        }

        if (m.prospectosSinActividadDetalle?.length) {
            m.prospectosSinActividadDetalle.slice(0, 3).forEach((p: Prospecto) => items.push({
                priority: 4, icon: '💤', text: `${p.organizacion} — sin actividad reciente`,
                action: 'Hacer seguimiento', type: 'prospecto'
            }))
        }

        return items.sort((a, b) => a.priority - b.priority).slice(0, 8)
    }, [m, tickets])

    // Pipeline stages
    const stages: PipelineStage[] = [
        { key: 'Contactado', label: 'Contactado', emoji: '🔵' },
        { key: 'Reunión agendada', label: 'Reunión', emoji: '🟡' },
        { key: 'Propuesta enviada', label: 'Propuesta', emoji: '🟠' },
        { key: 'Negociación', label: 'Negociación', emoji: '🟢' },
    ].map(s => ({
        ...s,
        count: (prospectos || []).filter(p => p.estado === s.key).length,
        value: Math.round((prospectos || []).filter(p => p.estado === s.key).reduce((sum, p) => sum + (parseFloat(String(p.valor)) || 0), 0))
    }))

    const scoreBarColor = healthScore.color === 'verde' ? 'bg-verde' : healthScore.color === 'azul' ? 'bg-azul' : healthScore.color === 'naranja' ? 'bg-naranja' : 'bg-red-500'

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    Hola, {user?.name || user?.email?.split('@')[0] || 'Equipo'} 👋
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">UF: ${ufActual?.toLocaleString('es-CL') || '---'}</div>
            </div>

            {/* Health Score Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{healthScore.emoji}</span>
                        <div>
                            <div className="font-bold text-gray-800 dark:text-gray-200">{healthScore.label}</div>
                            <div className="text-xs text-gray-400">Salud del negocio</div>
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-gray-300 dark:text-gray-600">{healthScore.score}</div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                    <div className={`${scoreBarColor} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${healthScore.score}%` }}></div>
                </div>
                <div className="space-y-1.5">
                    {healthScore.details.map((d, i) => (
                        <div key={i} className={`text-sm flex items-start gap-2 ${d.type === 'good' ? 'text-green-600 dark:text-green-400' : d.type === 'bad' ? 'text-red-600 dark:text-red-400' : d.type === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            <span className="flex-shrink-0">{d.icon}</span>
                            <span>{d.text}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric title="Pipeline" value={`${Math.round(m.pipelineTotal || 0)} UF`} sub={`${m.totalProspectos || 0} prospectos`} color="azul" />
                <Metric title="MRR" value={`${Math.round(m.mrrActual || 0)} UF`} sub="Recurrente mensual" color="verde" />
                <Metric title="Ganado mes" value={`${Math.round(m.valorGanadoEsteMes || 0)} UF`} sub={`Anterior: ${Math.round(m.valorGanadoMesAnterior || 0)} UF`} color={m.valorGanadoEsteMes >= (m.valorGanadoMesAnterior || 0) ? 'verde' : 'naranja'} />
                <Metric title="Tickets Activos" value={`${(tickets || []).length}`} sub={`${Math.round(m.valorTickets || 0)} UF total`} color="naranja" />
                <Metric title="Conversión" value={`${m.tasaConversion || 0}%`} sub={`Anterior: ${m.tasaConversionMesAnterior || 0}%`} color="azul" />
                <Metric title="Forecast" value={`${Math.round(m.pipelinePonderado || 0)} UF`} sub="Pipeline ponderado" color="fucsia" />
            </div>

            {/* Action Items + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Action Items */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">🎯 Acciones Pendientes</h3>
                    {actionItems.length === 0 ? (
                        <div className="text-center py-6">
                            <div className="text-3xl mb-2">🎉</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Todo al día — sin acciones pendientes</div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {actionItems.map((item, i) => (
                                <div key={item.id || `${item.text}-${i}`} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                    <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.text}</div>
                                        <div className="text-[10px] text-gray-400">{item.action}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pipeline Funnel */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">📊 Pipeline</h3>
                    <div className="space-y-3">
                        {stages.map(s => (
                            <div key={s.key} className="flex items-center gap-3">
                                <span className="text-lg">{s.emoji}</span>
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                                        <span className="text-gray-500 dark:text-gray-400">{s.count} · {s.value} UF</span>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                        <div className="bg-azul h-2 rounded-full transition-all" style={{ width: `${m.pipelineTotal > 0 ? Math.max(4, (s.value / m.pipelineTotal) * 100) : 0}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t dark:border-gray-700 text-sm text-gray-500 flex justify-between">
                        <span>Total Pipeline</span>
                        <span className="font-bold text-azul">{Math.round(m.pipelineTotal || 0)} UF</span>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            {actividadReciente && actividadReciente.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">📋 Actividad Reciente</h3>
                    <div className="space-y-2">
                        {actividadReciente.slice(0, 8).map((act, i) => (
                            <div key={act.id || `${act.kind || 'a'}-${act.created_at || i}`} className="flex items-start gap-3 text-sm py-1.5 border-b dark:border-gray-700 last:border-0">
                                <span className="text-base flex-shrink-0">{act.icono_mejorado || '📌'}</span>
                                <div className="flex-1 min-w-0">
                                    <span className="text-gray-700 dark:text-gray-300">{act.titulo_mejorado || act.label || 'Actividad'}</span>
                                    <span className="text-[10px] text-gray-400 ml-2">
                                        {act.created_at ? new Date(act.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
