import { useMemo } from 'react'
import {
    CheckCircle2, AlertCircle, AlertTriangle, Minus, Lightbulb, Globe,
    Clock, RefreshCw, MoonStar, Target, PartyPopper, Activity, TrendingUp
} from 'lucide-react'
import { diasDesdeHoy } from '../../utils/formatters'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../../types'

interface MetricProps {
    title: string
    value: string
    sub?: string
    accent?: boolean
}

const Metric = ({ title, value, sub, accent = false }: MetricProps) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:shadow transition">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{title}</div>
        <div className={`text-xl font-bold tnum ${accent ? 'text-naranja' : 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
        {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
)

interface HealthDetail {
    text: string
    type: 'good' | 'bad' | 'warn' | 'neutral' | 'tip' | 'diverse'
}

interface HealthScore {
    score: number
    label: string
    color: string
    details: HealthDetail[]
}

interface ActionItem {
    priority: number
    kind: 'vencido' | 'entrega' | 'renovar' | 'dormido'
    text: string
    action: string
    type: string
    id?: string
}

interface PipelineStage {
    key: string
    label: string
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

const DETAIL_ICONS = {
    good: { Icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400' },
    bad: { Icon: AlertCircle, cls: 'text-red-600 dark:text-red-400' },
    warn: { Icon: AlertTriangle, cls: 'text-yellow-600 dark:text-yellow-400' },
    neutral: { Icon: Minus, cls: 'text-gray-500 dark:text-gray-400' },
    tip: { Icon: Lightbulb, cls: 'text-yellow-600 dark:text-yellow-400' },
    diverse: { Icon: Globe, cls: 'text-green-600 dark:text-green-400' },
} as const

const ACTION_ICONS = {
    vencido: { Icon: AlertCircle, cls: 'text-red-500' },
    entrega: { Icon: Clock, cls: 'text-yellow-600' },
    renovar: { Icon: RefreshCw, cls: 'text-azul' },
    dormido: { Icon: MoonStar, cls: 'text-gray-400' },
} as const

export default function Dashboard({ metrics, prospectos, cerrados, tickets, keyAccounts, user, ufActual, actividadReciente }: DashboardProps) {
    void cerrados
    const m: Metrics = metrics || {}

    // ===== HEALTH SCORE: 0-100 composite =====
    const healthScore = useMemo((): HealthScore => {
        let score = 50
        const details: HealthDetail[] = []

        // 1. Pipeline health (0-20 pts)
        const pipelineValue = m.pipelineTotal || 0
        const mrrActual = m.mrrActual || 0
        const pipelineRatio = mrrActual > 0 ? pipelineValue / mrrActual : 0
        if (pipelineRatio >= 3) { score += 20; details.push({ text: `Pipeline sano: ${Math.round(pipelineRatio)}x el MRR`, type: 'good' }) }
        else if (pipelineRatio >= 1.5) { score += 10; details.push({ text: `Pipeline aceptable: ${Math.round(pipelineRatio * 10) / 10}x el MRR (ideal: 3x)`, type: 'warn' }) }
        else { score -= 5; details.push({ text: `Pipeline bajo: ${Math.round(pipelineRatio * 10) / 10}x el MRR — necesitas más prospectos`, type: 'bad' }) }

        // 2. Conversion momentum (0-15 pts)
        const cerradosEsteMes = m.cerradosEsteMes || 0
        if (cerradosEsteMes >= 2) { score += 15; details.push({ text: `${cerradosEsteMes} cierres este mes — buen ritmo`, type: 'good' }) }
        else if (cerradosEsteMes >= 1) { score += 8; details.push({ text: `${cerradosEsteMes} cierre este mes`, type: 'warn' }) }
        else { score -= 5; details.push({ text: 'Sin cierres este mes', type: 'bad' }) }

        // 3. Tendencia de VENTAS CERRADAS (-10 a +15 pts).
        // Ojo: variacionIngresos compara cierres nuevos mes a mes, NO ingresos totales.
        // Si no hubo cierres pero el MRR está vigente, se trata como neutro — antes
        // mostraba "Ingresos cayendo -100%" con contratos perfectamente estables.
        const variacion = m.variacionIngresos || 0
        if (variacion > 10) { score += 15; details.push({ text: `Ventas cerradas creciendo +${Math.round(variacion)}% vs mes anterior`, type: 'good' }) }
        else if (variacion >= -5) { score += 5; details.push({ text: `Ventas cerradas estables (${variacion > 0 ? '+' : ''}${Math.round(variacion)}%)`, type: 'neutral' }) }
        else if (cerradosEsteMes === 0 && mrrActual > 0) { details.push({ text: `Sin cierres nuevos este mes — MRR vigente (${Math.round(mrrActual)} UF/mes)`, type: 'neutral' }) }
        else { score -= 10; details.push({ text: `Ventas cerradas cayendo ${Math.round(variacion)}% vs mes anterior`, type: 'bad' }) }

        // 4. Key Accounts health (0-15 pts)
        const kaTotal = (keyAccounts || []).length
        const kaRiesgo = (keyAccounts || []).filter(ka => ka.salud === 'Riesgo' || ka.salud === 'Crítico').length
        if (kaTotal > 0 && kaRiesgo === 0) { score += 15; details.push({ text: `${kaTotal} Key Accounts, todos saludables`, type: 'good' }) }
        else if (kaRiesgo > 0) { score -= kaRiesgo * 5; details.push({ text: `${kaRiesgo} Key Account${kaRiesgo > 1 ? 's' : ''} en riesgo`, type: 'bad' }) }
        else { details.push({ text: 'Sin Key Accounts activos — ¿oportunidad de upsell?', type: 'tip' }) }

        // 5. Pipeline activity (-10 to +10 pts)
        const vencidos = m.prospectosVencidos || 0
        const sinActividad = m.prospectosSinActividad || 0
        if (vencidos === 0 && sinActividad === 0) { score += 10; details.push({ text: 'Pipeline activo, sin prospectos abandonados', type: 'good' }) }
        else {
            if (vencidos > 0) { score -= vencidos * 3; details.push({ text: `${vencidos} prospecto${vencidos > 1 ? 's' : ''} con fecha límite vencida`, type: 'bad' }) }
            if (sinActividad > 0) { score -= sinActividad * 2; details.push({ text: `${sinActividad} prospecto${sinActividad > 1 ? 's' : ''} sin ediciones en 14+ días`, type: 'warn' }) }
        }

        // 6. Diversification bonus
        const uniqueClients = new Set([
            ...(keyAccounts || []).map(ka => ka.organizacion?.trim().toLowerCase()),
            ...(tickets || []).map(t => t.organizacion?.trim().toLowerCase())
        ].filter(Boolean)).size
        if (uniqueClients >= 5) { score += 5; details.push({ text: `${uniqueClients} clientes activos — buena diversificación`, type: 'diverse' }) }
        else if (uniqueClients >= 3) { score += 2 }
        else if (uniqueClients > 0) { details.push({ text: `Solo ${uniqueClients} cliente${uniqueClients > 1 ? 's' : ''} activo${uniqueClients > 1 ? 's' : ''} — riesgo de concentración`, type: 'warn' }) }

        score = Math.max(0, Math.min(100, score))
        const label = score >= 80 ? 'Excelente' : score >= 60 ? 'Saludable' : score >= 40 ? 'Requiere atención' : 'Crítico'
        const color = score >= 80 ? 'verde' : score >= 60 ? 'azul' : score >= 40 ? 'naranja' : 'red'
        return { score, label, color, details }
    }, [m, keyAccounts, tickets])

    // ===== ACTIONABLE ITEMS =====
    const actionItems = useMemo((): ActionItem[] => {
        const items: ActionItem[] = []

        if (m.prospectosVencidosDetalle?.length) {
            m.prospectosVencidosDetalle.forEach((p: Prospecto) => items.push({
                priority: 1, kind: 'vencido', text: `${p.organizacion} — fecha límite vencida`,
                action: 'Contactar o cerrar', type: 'prospecto'
            }))
        }

        ;(tickets || []).forEach(t => {
            const dias = diasDesdeHoy(t.fecha_entrega)
            if (dias !== null && dias >= 0 && dias <= 7) {
                items.push({ priority: 2, kind: 'entrega', text: `${t.organizacion} — ${t.ticket} ${dias === 0 ? 'entrega HOY' : `entrega en ${dias} día${dias !== 1 ? 's' : ''}`}`, action: `${t.porcentaje_avance || 0}% avance`, type: 'ticket' })
            }
        })

        if (m.keyAccountsPorRenovarDetalle?.length) {
            m.keyAccountsPorRenovarDetalle.forEach((ka: KeyAccount) => items.push({
                priority: 3, kind: 'renovar', text: `${ka.organizacion} — ${ka.servicio} por renovar`,
                action: 'Gestionar renovación', type: 'ka'
            }))
        }

        if (m.prospectosSinActividadDetalle?.length) {
            m.prospectosSinActividadDetalle.slice(0, 3).forEach((p: Prospecto) => items.push({
                priority: 4, kind: 'dormido', text: `${p.organizacion} — sin ediciones en 14+ días`,
                action: 'Hacer seguimiento', type: 'prospecto'
            }))
        }

        return items.sort((a, b) => a.priority - b.priority).slice(0, 8)
    }, [m, tickets])

    // Pipeline stages
    const stages: PipelineStage[] = [
        { key: 'Contactado', label: 'Contactado' },
        { key: 'Reunión agendada', label: 'Reunión' },
        { key: 'Propuesta enviada', label: 'Propuesta' },
        { key: 'Negociación', label: 'Negociación' },
    ].map(s => ({
        ...s,
        count: (prospectos || []).filter(p => p.estado === s.key).length,
        value: Math.round((prospectos || []).filter(p => p.estado === s.key).reduce((sum, p) => sum + (parseFloat(String(p.valor)) || 0), 0))
    }))

    const scoreColor = healthScore.color === 'verde' ? 'text-verde' : healthScore.color === 'azul' ? 'text-azul' : healthScore.color === 'naranja' ? 'text-naranja' : 'text-red-500'
    const scoreBarColor = healthScore.color === 'verde' ? 'bg-verde' : healthScore.color === 'azul' ? 'bg-azul' : healthScore.color === 'naranja' ? 'bg-naranja' : 'bg-red-500'

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    Hola, {user?.name || user?.email?.split('@')[0] || 'Equipo'}
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400 tnum">UF: ${ufActual?.toLocaleString('es-CL') || '---'}</div>
            </div>

            {/* ===== HERO: Salud del negocio ===== */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
                    {/* Score grande — responde "¿vamos bien?" de un vistazo */}
                    <div className="md:col-span-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Salud del negocio</div>
                        <div className="flex items-baseline gap-3">
                            <span className={`text-6xl font-bold tnum ${scoreColor}`}>{healthScore.score}</span>
                            <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">{healthScore.label}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mt-4">
                            <div className={`${scoreBarColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${healthScore.score}%` }}></div>
                        </div>
                    </div>
                    {/* Detalle del score */}
                    <div className="md:col-span-3 space-y-1.5">
                        {healthScore.details.map((d, i) => {
                            const { Icon, cls } = DETAIL_ICONS[d.type] || DETAIL_ICONS.neutral
                            return (
                                <div key={i} className={`text-sm flex items-start gap-2 ${cls}`}>
                                    <Icon size={15} className="flex-shrink-0 mt-0.5" />
                                    <span>{d.text}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric title="Pipeline" value={`${Math.round(m.pipelineTotal || 0)} UF`} sub={`${m.totalProspectos || 0} prospectos`} />
                <Metric title="MRR" value={`${Math.round(m.mrrActual || 0)} UF`} sub="Recurrente mensual" accent />
                <Metric title="Ganado mes" value={`${Math.round(m.valorGanadoEsteMes || 0)} UF`} sub={`Anterior: ${Math.round(m.valorGanadoMesAnterior || 0)} UF`} />
                <Metric title="Tickets activos" value={`${(tickets || []).length}`} sub={`${Math.round(m.valorTickets || 0)} UF total`} />
                <Metric title="Conversión (mes)" value={`${m.tasaConversion || 0}%`} sub={`Mes ant: ${m.tasaConversionMesAnterior || 0}% · Global: ${m.tasaConversionGlobal || 0}%`} />
                <Metric title="Forecast" value={`${Math.round(m.pipelinePonderado || 0)} UF`} sub="Pipeline ponderado" />
            </div>

            {/* Action Items + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Action Items */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Target size={16} className="text-naranja" /> Acciones pendientes</h3>
                    {actionItems.length === 0 ? (
                        <div className="text-center py-6">
                            <PartyPopper size={28} className="mx-auto mb-2 text-verde" />
                            <div className="text-sm text-gray-500 dark:text-gray-400">Todo al día — sin acciones pendientes</div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {actionItems.map((item, i) => {
                                const { Icon, cls } = ACTION_ICONS[item.kind]
                                return (
                                    <div key={item.id || `${item.text}-${i}`} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        <Icon size={15} className={`flex-shrink-0 mt-0.5 ${cls}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{item.text}</div>
                                            <div className="text-[10px] text-gray-400">{item.action}</div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Pipeline Funnel */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-gray-400" /> Pipeline</h3>
                    <div className="space-y-3">
                        {stages.map(s => (
                            <div key={s.key}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                                    <span className="text-gray-500 dark:text-gray-400 tnum">{s.count} · {s.value} UF</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                    <div className="bg-naranja h-2 rounded-full transition-all" style={{ width: `${m.pipelineTotal > 0 ? Math.max(4, (s.value / m.pipelineTotal) * 100) : 0}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t dark:border-gray-700 text-sm text-gray-500 flex justify-between">
                        <span>Total Pipeline</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100 tnum">{Math.round(m.pipelineTotal || 0)} UF</span>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            {actividadReciente && actividadReciente.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Activity size={16} className="text-gray-400" /> Actividad reciente</h3>
                    <div className="space-y-2">
                        {actividadReciente.slice(0, 8).map((act, i) => (
                            <div key={act.id || `${act.kind || 'a'}-${act.created_at || i}`} className="flex items-start gap-3 text-sm py-1.5 border-b dark:border-gray-700 last:border-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0 mt-1.5"></span>
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

