import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'
import { confirmModal } from '../../utils/confirmModal'
import useEscapeKey from '../../hooks/useEscapeKey'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../../types'

const tipoIcons: Record<string, string> = { nota: '📝', llamada: '📞', reunion: '🤝', email: '📧', tarea: '✅' }
const tipoLabels: Record<string, string> = { nota: 'Nota', llamada: 'Llamada', reunion: 'Reunión', email: 'Email', tarea: 'Tarea' }
const tableMap: Record<string, string> = { prospecto: 'prospectos', cerrado: 'cerrados', ticket: 'tickets', keyaccount: 'key_accounts' }
const servicioOptions = ['Ticket RC Express', 'Ticket Diag Org', 'Ticket ESG', 'Key Account Nivel 1', 'Key Account Nivel 2', 'Key Account Nivel 3', 'Gestión de Contenido']

// Lifecycle helpers
const lcTypeName = (t: string) => ({ prospecto: 'Prospecto', ticket: 'Ticket', key_account: 'Key Account', keyaccount: 'Key Account', cerrado: 'Cerrado' }[t] || t)
const lcEventIcon = (t: string) => {
    if (!t) return '📋'
    if (t.startsWith('created_from')) return '🔄'
    if (t.includes('renewal')) return '🔑'
    if (t.includes('file')) return '📎'
    if (t.includes('closed') || t.includes('cancel')) return '✅'
    if (t.includes('created')) return '✨'
    if (t.includes('stage') || t.includes('estado') || t.includes('moved')) return '📍'
    return '📋'
}
const lcEventLabel = (t: string) => {
    const m: Record<string, string> = {
        created_from_prospecto: 'Creado desde Prospecto', created_from_ticket: 'Creado desde Ticket',
        renewal_created: 'Renovación registrada', ticket_closed: 'Ticket cerrado',
        ka_cancelled: 'Contrato cancelado', file_uploaded: 'Archivo adjunto'
    }
    return m[t] || (t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface LifecycleItem {
    id: string; kind: 'event' | 'link'; created_at: string
    icon: string; label: string; title: string; email?: string
    payload?: Record<string, unknown>
}
interface LifecycleOrigin { tipo: string; id: string; org: string; fecha: string }

type EntityType = 'prospecto' | 'cerrado' | 'ticket' | 'keyaccount'

interface Nota {
    id: string
    entidad_tipo: string
    entidad_id: string
    tipo: string
    contenido: string
    created_at: string
    created_by_email?: string
    completada?: boolean
}

interface Contacto {
    id: string
    organizacion?: string
    nombre: string
    cargo?: string
    email?: string
    telefono?: string
}

interface EntityDetailProps {
    entity: { type: EntityType; item: Prospecto | Cerrado | Ticket | KeyAccount }
    onClose: () => void
    contactos: Contacto[]
    notas: Nota[]
    user: { email?: string; name?: string } | null
    keyAccounts?: KeyAccount[]
    ufActual?: number
    onRefresh: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormData = Record<string, any>

export default function EntityDetail({ entity, onClose, contactos, notas, user, keyAccounts = [], ufActual = 38000, onRefresh }: EntityDetailProps) {
    const { type, item } = entity
    useEscapeKey(onClose)
    const [activeSection, setActiveSection] = useState('ficha')
    const [formData, setFormData] = useState<FormData>({ ...item })
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [newNota, setNewNota] = useState({ tipo: 'nota', contenido: '' })
    const [newContacto, setNewContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '' })
    const [lifecycleItems, setLifecycleItems] = useState<LifecycleItem[]>([])
    const [lifecycleLoading, setLifecycleLoading] = useState(false)
    const [lifecycleLoaded, setLifecycleLoaded] = useState(false)
    const [lifecycleOrigin, setLifecycleOrigin] = useState<LifecycleOrigin | null>(null)

    useEffect(() => {
        if (activeSection !== 'timeline' || lifecycleLoaded) return
        void loadLifecycle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection])

    const entityNotas = useMemo(() =>
        notas.filter(n => n.entidad_tipo === type && n.entidad_id === item.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [notas, type, item.id]
    )
    const entityContactos = useMemo(() =>
        contactos.filter(c => c.organizacion?.toLowerCase() === (item.organizacion || '').toLowerCase()),
        [contactos, item.organizacion]
    )

    const update = (field: string, value: unknown) => { setFormData((prev: FormData) => ({ ...prev, [field]: value })); setDirty(true) }

    // Campos que existen en el tipo TS pero no en la tabla de Supabase (schema drift)
    const excludeByType: Record<EntityType, string[]> = {
        prospecto: [], ticket: [], keyaccount: ['tipo', 'contacto'], cerrado: []
    }

    const handleSave = async () => {
        setSaving(true)
        const table = tableMap[type]
        const { id, created_at, updated_at, created_by_email, ...rest } = formData
        void created_at; void updated_at; void created_by_email
        const excluded = excludeByType[type] || []
        const payload = Object.fromEntries(Object.entries(rest).filter(([k]) => !excluded.includes(k)))
        const { error } = await supabase.from(table).update(payload).eq('id', id)
        if (error) { showToast('Error al guardar: ' + (error.message || 'desconocido'), 'error'); console.error(error) }
        else { showToast('Guardado ✓', 'success'); setDirty(false); onRefresh() }
        setSaving(false)
    }

    const handleAddNota = async () => {
        if (!newNota.contenido.trim()) return
        setSaving(true)
        const { error } = await supabase.from('notas').insert({
            entidad_tipo: type, entidad_id: item.id, tipo: newNota.tipo,
            contenido: newNota.contenido.trim(), created_by_email: user?.email || 'anon'
        })
        if (error) showToast('Error', 'error')
        else { showToast('Nota agregada', 'success'); setNewNota({ tipo: 'nota', contenido: '' }); onRefresh() }
        setSaving(false)
    }

    const handleAddContacto = async () => {
        if (!newContacto.nombre.trim()) return
        setSaving(true)
        const { error } = await supabase.from('contactos').insert({
            organizacion: formData.organizacion || '', ...newContacto, created_by_email: user?.email || 'anon'
        })
        if (error) showToast('Error', 'error')
        else { showToast('Contacto agregado', 'success'); setNewContacto({ nombre: '', cargo: '', email: '', telefono: '' }); onRefresh() }
        setSaving(false)
    }

    const handleDeleteNota = async (id: string) => {
        if (!(await confirmModal('¿Eliminar esta nota?', { danger: true, confirmLabel: 'Eliminar' }))) return
        await supabase.from('notas').delete().eq('id', id)
        onRefresh()
    }
    const handleToggleTarea = async (nota: Nota) => { await supabase.from('notas').update({ completada: !nota.completada }).eq('id', nota.id); onRefresh() }
    const handleDeleteContacto = async (id: string) => {
        if (!(await confirmModal('¿Eliminar este contacto?', { danger: true, confirmLabel: 'Eliminar' }))) return
        await supabase.from('contactos').delete().eq('id', id)
        onRefresh()
    }
    const fmtDateTime = (d: string | undefined) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
    const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

    const loadLifecycle = async () => {
        setLifecycleLoading(true)
        try {
            const table = tableMap[type]
            const { data: events } = await supabase
                .from('crm_events')
                .select('id, event_type, title, payload, created_at, created_by_email')
                .eq('entity_type', table)
                .eq('entity_id', item.id)
                .order('created_at', { ascending: true })
                .limit(100)

            const { data: links } = await supabase
                .from('crm_entity_links')
                .select('id, from_type, from_id, to_type, to_id, link_type, created_at')
                .or(`from_id.eq.${item.id},to_id.eq.${item.id}`)
                .order('created_at', { ascending: true })
                .limit(50)

            // Resolve origin entity name if this was converted from another entity
            const incomingLink = (links || []).find((l: Record<string, string>) => l.to_id === item.id)
            let origin: LifecycleOrigin | null = null
            if (incomingLink) {
                const srcTableMap: Record<string, string> = { prospecto: 'prospectos', ticket: 'tickets', key_account: 'key_accounts', keyaccount: 'key_accounts', cerrado: 'cerrados' }
                const srcTable = srcTableMap[incomingLink.from_type]
                if (srcTable) {
                    const { data: src } = await supabase.from(srcTable).select('organizacion').eq('id', incomingLink.from_id).single()
                    if (src) origin = { tipo: incomingLink.from_type, id: incomingLink.from_id, org: (src as { organizacion: string }).organizacion, fecha: incomingLink.created_at }
                }
            }
            setLifecycleOrigin(origin)

            // Build unified lifecycle items (events + links), sorted ascending
            const items: LifecycleItem[] = [
                ...(events || []).map((e: Record<string, unknown>) => ({
                    id: String(e.id), kind: 'event' as const, created_at: (e.created_at as string) || '',
                    icon: lcEventIcon(e.event_type as string), label: lcEventLabel(e.event_type as string),
                    title: (e.title as string) || '', email: (e.created_by_email as string) || '',
                    payload: e.payload as Record<string, unknown>
                })),
                ...(links || []).map((l: Record<string, string>) => ({
                    id: String(l.id), kind: 'link' as const, created_at: l.created_at || '',
                    icon: '🔄',
                    label: l.from_id === item.id ? `Convertido a ${lcTypeName(l.to_type)}` : `Creado desde ${lcTypeName(l.from_type)}`,
                    title: '', email: ''
                }))
            ].filter(e => e.created_at).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

            setLifecycleItems(items)
            setLifecycleLoaded(true)
        } catch (err) {
            console.error('Error cargando ciclo de vida:', err)
        } finally {
            setLifecycleLoading(false)
        }
    }

    // Merge notas + lifecycle events chronologically (ascending = oldest first)
    const allTimelineItems = useMemo(() => {
        const notaItems = [...entityNotas].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const merged: Array<{ kind: 'nota'; data: Nota } | { kind: 'lc'; data: LifecycleItem }> = [
            ...notaItems.map(n => ({ kind: 'nota' as const, data: n })),
            ...lifecycleItems.map(e => ({ kind: 'lc' as const, data: e }))
        ]
        return merged.sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime())
    }, [entityNotas, lifecycleItems])

    const org: string = formData.organizacion || formData.ticket || 'Sin nombre'
    const info = (() => {
        switch (type) {
            case 'prospecto': return { badge: formData.estado, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
            case 'ticket': return { badge: formData.fase_actual || 'Activo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
            case 'keyaccount': return { badge: formData.salud || 'Activo', color: formData.salud === 'Crítico' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
            case 'cerrado': return { badge: formData.estado_final, color: formData.estado_final === 'Ganado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' }
            default: return { badge: '', color: '' }
        }
    })()

    const sections = [
        { id: 'ficha', label: '📄 Ficha' },
        { id: 'timeline', label: '📋 Timeline', count: entityNotas.length + lifecycleItems.length },
        { id: 'contactos', label: '👤 Contactos', count: entityContactos.length },
    ]

    // Render helpers (functions, NOT components — avoids remount/focus-loss)
    const cls = "w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-transparent"
    const renderField = (label: string, content: React.ReactNode, span2?: boolean) => (
        <div className={span2 ? 'sm:col-span-2' : ''} key={label}>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{label}</label>
            {content}
        </div>
    )
    const inp = (field: string, t = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <input type={t} value={formData[field] ?? ''} onChange={e => update(field, t === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} className={cls} {...extra} />
    )
    const sel = (field: string, options: string[]) => (
        <select value={formData[field] ?? ''} onChange={e => update(field, e.target.value)} className={cls}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    )
    const ta = (field: string, rows = 3) => (
        <textarea value={formData[field] ?? ''} onChange={e => update(field, e.target.value)} rows={rows} className={cls + ' resize-none'} />
    )

    // Other KA services for this org
    const otherServices = type === 'keyaccount' ? keyAccounts.filter(ka =>
        (ka.organizacion || '').trim().toLowerCase() === (formData.organizacion || '').trim().toLowerCase() && String(ka.id) !== String(formData.id)
    ) : []

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-6 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b dark:border-gray-700">
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${info.color}`}>{info.badge}</span>
                                <span className="text-[10px] text-gray-400 uppercase">{type}</span>
                            </div>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 truncate">{org}</h2>
                            {type === 'keyaccount' && formData.servicio && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">{formData.servicio}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            {(type === 'prospecto' || type === 'keyaccount') && (
                                <button onClick={async () => {
                                    const valor = type === 'keyaccount' ? formData.uf_mes : formData.valor
                                    try {
                                        const { generateProposal } = await import('../../utils/proposalPDF')
                                        generateProposal({
                                            organizacion: formData.organizacion,
                                            contacto: formData.contacto,
                                            tipo: formData.tipo || formData.servicio || type,
                                            valor: valor,
                                            moneda: 'UF',
                                            ufActual,
                                            notas: formData.notas || formData.proximo_paso || ''
                                        })
                                        showToast('PDF generado ✓', 'success')
                                    } catch (err) {
                                        console.error(err)
                                        showToast('No se pudo generar el PDF: ' + ((err as Error).message || ''), 'error')
                                    }
                                }} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition" title="Generar propuesta PDF">
                                    📄 Propuesta
                                </button>
                            )}
                            {dirty && <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50 hover:opacity-90 transition">{saving ? '...' : 'Guardar'}</button>}
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg transition">✕</button>
                        </div>
                    </div>
                </div>

                {/* Section tabs */}
                <div className="flex border-b dark:border-gray-700 px-5">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition ${activeSection === s.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                            {s.label} {s.count !== undefined ? `(${s.count})` : ''}
                        </button>
                    ))}
                </div>

                <div className="p-5 max-h-[65vh] overflow-y-auto">
                    {/* FICHA */}
                    {activeSection === 'ficha' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {renderField('Organización', inp('organizacion'))}
                            {renderField('Contacto', inp('contacto'))}
                            {renderField('Tipo de Servicio', sel('tipo', servicioOptions))}

                            {type === 'prospecto' && <>
                                {renderField('Estado', sel('estado', ['Contactado', 'Reunión agendada', 'Propuesta enviada', 'Negociación']))}
                                {renderField('Valor (UF)', inp('valor', 'number', { step: '0.01' }))}
                                {renderField('Probabilidad (%)', inp('probabilidad', 'number', { min: 0, max: 100 }))}
                                {renderField('Fecha Límite', inp('fecha_limite', 'date'))}
                                {renderField('Próximo Paso', inp('proximo_paso'))}
                                {renderField('Notas', ta('notas'), true)}
                            </>}

                            {type === 'ticket' && <>
                                {renderField('Nombre del Ticket', inp('ticket'))}
                                {renderField('Valor', (
                                    <div className="flex gap-2">
                                        <div className="flex-1">{inp('valor_monto', 'number', { step: '0.01' })}</div>
                                        <select value={formData.valor_moneda ?? 'UF'} onChange={e => update('valor_moneda', e.target.value)} className={cls + ' !w-20 flex-shrink-0'}>
                                            <option value="UF">UF</option>
                                            <option value="CLP">CLP</option>
                                        </select>
                                    </div>
                                ))}
                                {renderField('Fase', sel('fase_actual', ['Kick-off', 'Levantamiento', 'Análisis', 'Entrega', 'Cerrado']))}
                                {renderField('Avance (%)', inp('porcentaje_avance', 'number', { min: 0, max: 100 }))}
                                {renderField('Fecha Inicio', inp('fecha_inicio', 'date'))}
                                {renderField('Fecha Entrega', inp('fecha_entrega', 'date'))}
                                {renderField('Responsable', inp('responsable'))}
                            </>}

                            {type === 'keyaccount' && <>
                                {renderField('Servicio', inp('servicio'))}
                                {renderField('UF/mes', inp('uf_mes', 'number', { step: '0.01' }))}
                                {renderField('Salud', sel('salud', ['Excelente', 'Buena', 'Riesgo', 'Crítico', 'Vencido', 'Cerrado']))}
                                {renderField('Renovación', sel('renovacion', ['Confirmada', 'En conversación', 'No renovará', 'Por definir']))}
                                {renderField('Inicio Contrato', inp('inicio_contrato', 'date'))}
                                {renderField('Fin Contrato', inp('fin_contrato', 'date'))}
                                {renderField('Responsable', inp('responsable'))}
                            </>}

                            {type === 'keyaccount' && otherServices.length > 0 && (
                                <div className="sm:col-span-2 mt-1">
                                    <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Otros servicios activos</div>
                                    <div className="space-y-1.5">
                                        {otherServices.map(s => (
                                            <div key={s.id} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                                                <div>
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.servicio}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{s.uf_mes} UF/mes</span>
                                                </div>
                                                <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${s.salud === 'Excelente' || s.salud === 'Buena' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>{s.salud || '-'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {type === 'cerrado' && <>
                                {renderField('Estado Final', sel('estado_final', ['Ganado', 'Perdido']))}
                                {renderField('Valor (UF)', inp('valor', 'number', { step: '0.01' }))}
                                {renderField('Fecha Inicio', inp('fecha_inicio', 'date'))}
                                {renderField('Fecha Cierre', inp('fecha_cierre', 'date'))}
                                {formData.estado_final === 'Perdido' && renderField('Razón de Pérdida', sel('razon_perdida', ['Presupuesto', 'Timing', 'Competencia', 'No respondió', 'No calificado', 'Otro']))}
                                {renderField('Motivo de Cierre', inp('motivo_cierre'))}
                                {renderField('Notas', ta('notas'), true)}
                            </>}
                        </div>
                    )}

                    {/* TIMELINE */}
                    {activeSection === 'timeline' && (
                        <div className="space-y-4">
                            {/* Origen: si esta entidad fue convertida desde otra */}
                            {lifecycleOrigin && (
                                <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl px-4 py-3">
                                    <span className="text-lg">🔗</span>
                                    <div>
                                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Origen</p>
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            {lcTypeName(lifecycleOrigin.tipo)}: <span className="font-medium">{lifecycleOrigin.org}</span>
                                        </p>
                                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">Convertido el {fmtDate(lifecycleOrigin.fecha)}</p>
                                    </div>
                                </div>
                            )}

                            {/* Add nota form */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex gap-1.5 mb-2 flex-wrap">
                                    {Object.entries(tipoLabels).map(([k, v]) => (
                                        <button key={k} onClick={() => setNewNota({ ...newNota, tipo: k })}
                                            className={`px-2 py-1 text-[10px] rounded-lg transition ${newNota.tipo === k ? 'bg-naranja text-white' : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 border dark:border-gray-500'}`}>
                                            {tipoIcons[k]} {v}
                                        </button>
                                    ))}
                                </div>
                                <textarea value={newNota.contenido} onChange={e => setNewNota({ ...newNota, contenido: e.target.value })}
                                    placeholder={`Agregar ${tipoLabels[newNota.tipo].toLowerCase()}...`} rows={2}
                                    className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 resize-none" />
                                <div className="flex justify-end mt-2">
                                    <button onClick={handleAddNota} disabled={saving || !newNota.contenido.trim()} className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">Agregar</button>
                                </div>
                            </div>

                            {/* Unified chronological feed */}
                            {lifecycleLoading && (
                                <p className="text-xs text-gray-400 text-center py-2 animate-pulse">Cargando ciclo de vida…</p>
                            )}
                            {allTimelineItems.length === 0 && !lifecycleLoading ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin actividades registradas</p>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>
                                    {allTimelineItems.map((entry, idx) => {
                                        if (entry.kind === 'lc') {
                                            const e = entry.data
                                            return (
                                                <div key={`lc-${e.id}-${idx}`} className="relative pl-10 pb-3">
                                                    <div className="absolute left-2 top-1.5 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-500 flex items-center justify-center text-[9px]">{e.icon}</div>
                                                    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600/50">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{e.label}</span>
                                                            <span className="text-[10px] text-gray-400">{fmtDateTime(e.created_at)}</span>
                                                        </div>
                                                        {e.title && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{e.title}</p>}
                                                        {e.email && <p className="text-[10px] text-gray-400 mt-0.5">{e.email.split('@')[0]}</p>}
                                                    </div>
                                                </div>
                                            )
                                        }
                                        const n = entry.data
                                        return (
                                            <div key={`nota-${n.id}-${idx}`} className="relative pl-10 pb-3 group">
                                                <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-white dark:bg-gray-800 border-2 border-naranja"></div>
                                                <div className="bg-white dark:bg-gray-700 rounded-lg p-3 border dark:border-gray-600 shadow-sm">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs">{tipoIcons[n.tipo] || '📝'}</span>
                                                            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">{tipoLabels[n.tipo] || n.tipo}</span>
                                                            {n.tipo === 'tarea' && (
                                                                <button onClick={() => handleToggleTarea(n)} className={`text-[10px] px-1.5 py-0.5 rounded ${n.completada ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                                                    {n.completada ? '✓ Hecha' : 'Pendiente'}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-gray-400">{fmtDateTime(n.created_at)}</span>
                                                            <button onClick={() => handleDeleteNota(n.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition">✕</button>
                                                        </div>
                                                    </div>
                                                    <p className={`text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap ${n.tipo === 'tarea' && n.completada ? 'line-through text-gray-400' : ''}`}>{n.contenido}</p>
                                                    {n.created_by_email && <p className="text-[10px] text-gray-400 mt-1">{n.created_by_email.split('@')[0]}</p>}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CONTACTOS */}
                    {activeSection === 'contactos' && (
                        <div className="space-y-4">
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">Nuevo contacto en {formData.organizacion}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={newContacto.nombre} onChange={e => setNewContacto({ ...newContacto, nombre: e.target.value })} placeholder="Nombre *" className={cls} />
                                    <input value={newContacto.cargo} onChange={e => setNewContacto({ ...newContacto, cargo: e.target.value })} placeholder="Cargo" className={cls} />
                                    <input value={newContacto.email} onChange={e => setNewContacto({ ...newContacto, email: e.target.value })} placeholder="Email" type="email" className={cls} />
                                    <input value={newContacto.telefono} onChange={e => setNewContacto({ ...newContacto, telefono: e.target.value })} placeholder="Teléfono" className={cls} />
                                </div>
                                <div className="flex justify-end mt-2">
                                    <button onClick={handleAddContacto} disabled={saving || !newContacto.nombre.trim()} className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">Agregar contacto</button>
                                </div>
                            </div>

                            {entityContactos.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin contactos registrados</p>
                            ) : (
                                <div className="space-y-2">
                                    {entityContactos.map(c => (
                                        <div key={c.id} className="bg-white dark:bg-gray-700 rounded-lg p-3 border dark:border-gray-600 flex items-center gap-3 group">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-300 flex-shrink-0">
                                                {(c.nombre || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.nombre}</span>
                                                {c.cargo && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{c.cargo}</span>}
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {c.email && <span className="text-xs text-azul">{c.email}</span>}
                                                    {c.telefono && <span className="text-xs text-gray-500 dark:text-gray-400">{c.telefono}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteContacto(c.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
