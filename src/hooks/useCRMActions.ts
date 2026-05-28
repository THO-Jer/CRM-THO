import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import { confirmModal } from '../utils/confirmModal'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../types'

type User = { email?: string; id?: string } | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

interface UseCRMActionsParams {
    user: User
    requireAuth: () => boolean
    setShowModal: (v: boolean) => void
    editingItem: AnyRecord | null
    data: {
        prospectos: Prospecto[]
        setProspectos: (v: Prospecto[]) => void
        cerrados: Cerrado[]
        setCerrados: (v: Cerrado[]) => void
        tickets: Ticket[]
        setTickets: (v: Ticket[]) => void
        keyAccounts: KeyAccount[]
        setKeyAccounts: (v: KeyAccount[]) => void
    }
    loaders: {
        loadProspectos: () => Promise<void>
        loadCerrados: () => Promise<void>
        loadTickets: () => Promise<void>
        loadKeyAccounts: () => Promise<void>
        loadContactos: () => Promise<void>
        loadNotas: () => Promise<void>
        loadActividad: () => Promise<void>
    }
}

export default function useCRMActions({ user, requireAuth, setShowModal, editingItem, data, loaders }: UseCRMActionsParams) {
    const { prospectos, cerrados, tickets, keyAccounts } = data
    const { loadProspectos, loadCerrados, loadTickets, loadKeyAccounts } = loaders

    const logEvent = async (entityType: string, entityId: string, eventType: string, title: string, payload: AnyRecord = {}) => {
        try {
            if (!user) return
            await supabase.from('crm_events').insert([{
                entity_type: entityType, entity_id: entityId, event_type: eventType,
                title, payload, created_by: user?.id || null, created_by_email: user?.email || null,
            }])
        } catch (e) { console.warn('logEvent failed', (e as Error)?.message || e) }
    }

    const [historyOpen, setHistoryOpen] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyTitle, setHistoryTitle] = useState('')
    const [historyItems, setHistoryItems] = useState<AnyRecord[]>([])

    const [convertOpen, setConvertOpen] = useState(false)
    const [convertSource, setConvertSource] = useState<{ type: string; item: AnyRecord | null }>({ type: 'prospecto', item: null })
    const [convertTarget, setConvertTarget] = useState('ticket')
    const [convertForm, setConvertForm] = useState({ ticket: '', fecha_inicio: '', fecha_entrega: '', responsable: '', servicio: '', uf_mes: '', inicio_contrato: '', fin_contrato: '', notes: '' })

    const [renewalOpen, setRenewalOpen] = useState(false)
    const [renewalKA, setRenewalKA] = useState<AnyRecord | null>(null)
    const [renewalMode, setRenewalMode] = useState<'renew' | 'cancel'>('renew')
    const [renewalForm, setRenewalForm] = useState({ start_date: '', end_date: '', uf_mes: '', cancel_reason: '', notes: '' })
    const [cancelAlsoRegisterLoss, setCancelAlsoRegisterLoss] = useState(true)

    const [filesModalOpen, setFilesModalOpen] = useState(false)
    const [filesEntityType, setFilesEntityType] = useState<string | null>(null)
    const [filesEntityId, setFilesEntityId] = useState<string | null>(null)
    const [filesEntityName, setFilesEntityName] = useState('')
    const [filesList, setFilesList] = useState<AnyRecord[]>([])
    const [filesLoading, setFilesLoading] = useState(false)
    const [uploadingFile, setUploadingFile] = useState(false)

    const [closeTicketOpen, setCloseTicketOpen] = useState(false)
    const [closeTicketTarget, setCloseTicketTarget] = useState<AnyRecord | null>(null)

    const [selectedEntity, setSelectedEntity] = useState<{ type: string; item: AnyRecord } | null>(null)
    const openDetail = (type: string, item: AnyRecord) => setSelectedEntity({ type, item })

    const openConvert = (prospecto: AnyRecord, targetType = 'ticket') => {
        setConvertSource({ type: 'prospecto', item: prospecto })
        const today = new Date().toISOString().split('T')[0]
        setConvertTarget(targetType === 'keyaccount' || targetType === 'key_account' ? 'key_account' : 'ticket')
        setConvertForm({
            ticket: `Ejecución - ${prospecto?.organizacion || ''}`.trim(),
            fecha_inicio: today, fecha_entrega: prospecto?.fecha_limite || today,
            responsable: '', servicio: prospecto?.tipo || 'Servicio',
            uf_mes: String(prospecto?.valor ?? ''), inicio_contrato: today,
            fin_contrato: prospecto?.fecha_limite || today, notes: ''
        })
        setConvertOpen(true)
    }

    const openConvertFromCerrado = (cerrado: AnyRecord) => {
        setConvertSource({ type: 'cerrado', item: cerrado })
        const today = new Date().toISOString().split('T')[0]
        setConvertTarget('ticket')
        setConvertForm({
            ticket: `Ejecución - ${cerrado?.organizacion || ''}`.trim(),
            fecha_inicio: today, fecha_entrega: today, responsable: '',
            servicio: cerrado?.tipo || 'Servicio', uf_mes: String(cerrado?.valor ?? ''),
            inicio_contrato: today, fin_contrato: today, notes: ''
        })
        setConvertOpen(true)
    }

    const closeConvert = () => { setConvertOpen(false); setConvertSource({ type: 'prospecto', item: null }) }

    const submitConvert = async () => {
        if (!requireAuth()) return
        const sourceType = convertSource?.type
        const source = convertSource?.item
        if (!sourceType || !source) return

        if (convertTarget === 'ticket') {
            if (!convertForm.fecha_inicio || !convertForm.fecha_entrega) { showToast('Completa fecha de inicio y entrega', 'warning'); return }
        } else {
            if (!convertForm.inicio_contrato || !convertForm.fin_contrato) { showToast('Completa fecha de inicio y fin del contrato', 'warning'); return }
            const ufMes = Number(convertForm.uf_mes || source.valor || 0)
            if (!isFinite(ufMes) || ufMes <= 0) { showToast('UF/mes debe ser un valor positivo', 'warning'); return }
        }

        try {
            const fromId = source.id
            const fromEntityType = sourceType === 'prospecto' ? 'prospectos' : 'cerrados'
            const transitionFrom = sourceType === 'prospecto' ? 'prospecto' : 'cerrado'
            let toType: string | null = null, toId: string | null = null

            if (convertTarget === 'ticket') {
                const ticketRow = {
                    organizacion: source.organizacion,
                    ticket: convertForm.ticket || `Ejecución - ${source.organizacion}`,
                    fecha_inicio: convertForm.fecha_inicio, fecha_entrega: convertForm.fecha_entrega,
                    fase_actual: 'Inicio', porcentaje_avance: 0, responsable: convertForm.responsable || '',
                    satisfaccion: null, escalo: false,
                    proxima_accion: sourceType === 'prospecto' ? (source.proximo_paso || '') : '', status: 'Activo'
                }
                const { data, error } = await supabase.from('tickets').insert([ticketRow]).select('id').single()
                if (error) throw error
                toType = 'ticket'; toId = (data as { id: string }).id
                await logEvent('tickets', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId })
            } else {
                const kaRow = {
                    organizacion: source.organizacion,
                    servicio: convertForm.servicio || source.tipo || 'Servicio',
                    uf_mes: Math.max(0, Number(convertForm.uf_mes || source.valor || 0)),
                    inicio_contrato: convertForm.inicio_contrato, fin_contrato: convertForm.fin_contrato,
                    renovacion: 'Mensual', salud: 'OK',
                    ultima_reunion: null, proxima_reunion: null, valor_uf_cierre: null, fecha_cierre_uf: null
                }
                const { data, error } = await supabase.from('key_accounts').insert([kaRow]).select('id').single()
                if (error) throw error
                toType = 'key_account'; toId = (data as { id: string }).id
                try {
                    await supabase.from('crm_renewals').insert([{ key_account_id: toId, start_date: kaRow.inicio_contrato, end_date: kaRow.fin_contrato, uf_mes: kaRow.uf_mes, status: 'active', notes: `Seed desde conversión (${transitionFrom})` }])
                } catch { /* no-op */ }
                await logEvent('key_accounts', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId })
            }

            try { await supabase.from('crm_entity_links').insert([{ from_type: transitionFrom, from_id: fromId, to_type: toType, to_id: toId, link_type: 'transition' }]) } catch { /* no-op */ }
            try { await supabase.from('crm_transitions').insert([{ entity_from: transitionFrom, entity_from_id: fromId, entity_to: toType, entity_to_id: toId, reason: 'Conversión', notes: convertForm.notes || null, created_by_email: user?.email || null }]) } catch { /* no-op */ }

            if (sourceType === 'prospecto') {
                const cerradoGanado = { organizacion: source.organizacion, tipo: source.tipo, estado_final: 'Ganado', fecha_cierre: new Date().toISOString().split('T')[0], valor: source.valor, razon_perdida: '', escalo: false, valor_total_final: source.valor, fecha_contacto: source.created_at }
                try { await supabase.from('cerrados').insert([cerradoGanado]) } catch (e) { console.warn('No se pudo guardar en Historial:', e) }
                const { error: updErr } = await supabase.from('prospectos').update({ estado: 'Convertido', proximo_paso: `Convertido a ${toType === 'ticket' ? 'Ticket' : 'Key Account'}` }).eq('id', fromId)
                if (updErr) throw updErr
            }

            await logEvent(fromEntityType, fromId, 'converted', `${transitionFrom} convertido`, { to_type: toType, to_id: toId })
            await Promise.all([loadProspectos(), loadCerrados(), loadTickets(), loadKeyAccounts()])
            closeConvert()
        } catch (error) { showToast('Error al convertir: ' + (error as Error).message, 'error') }
    }

    const openRenewal = (ka: AnyRecord) => {
        const today = new Date().toISOString().split('T')[0]
        setRenewalKA(ka); setRenewalMode('renew')
        setRenewalForm({ start_date: today, end_date: ka?.fin_contrato || today, uf_mes: String(ka?.uf_mes ?? ''), cancel_reason: '', notes: '' })
        setRenewalOpen(true)
    }

    const openCancelKA = (ka: AnyRecord) => {
        const today = new Date().toISOString().split('T')[0]
        setRenewalKA(ka); setRenewalMode('cancel'); setCancelAlsoRegisterLoss(true)
        setRenewalForm({ start_date: today, end_date: ka?.fin_contrato || today, uf_mes: String(ka?.uf_mes ?? ''), cancel_reason: '', notes: '' })
        setRenewalOpen(true)
    }

    const closeRenewal = () => { setRenewalOpen(false); setRenewalKA(null) }

    const submitRenewal = async () => {
        if (!requireAuth() || !renewalKA) return
        try {
            const kaId = renewalKA.id
            if (renewalMode === 'cancel') {
                try {
                    const { error } = await supabase.rpc('crm_cancel_key_account', { p_key_account_id: kaId, p_cancel_reason: renewalForm.cancel_reason || null, p_notes: renewalForm.notes || null })
                    if (error) throw error
                } catch {
                    await supabase.from('crm_renewals').update({ status: 'cancelled', cancel_reason: renewalForm.cancel_reason || null, notes: renewalForm.notes || null }).eq('key_account_id', kaId).eq('status', 'active')
                }
                await logEvent('key_accounts', kaId, 'renewal_cancelled', 'Contrato cancelado', { cancel_reason: renewalForm.cancel_reason || null })
                await supabase.from('key_accounts').update({ salud: 'Cerrado', updated_at: new Date().toISOString() }).eq('id', kaId)
                if (cancelAlsoRegisterLoss) {
                    const today = new Date().toISOString().split('T')[0]
                    const closedRow = { organizacion: renewalKA.organizacion, tipo: renewalKA.servicio, estado_final: 'Perdido', fecha_cierre: today, valor: renewalKA.uf_mes, razon_perdida: renewalForm.cancel_reason || '', escalo: false, valor_total_final: renewalKA.uf_mes, fecha_contacto: today }
                    const { error: cerrErr } = await supabase.from('cerrados').insert([closedRow])
                    if (!cerrErr) await loadCerrados()
                    else console.warn('No se pudo registrar en cerrados:', cerrErr.message)
                }
            } else {
                const { start_date: start, end_date: end } = renewalForm
                const uf = Number(renewalForm.uf_mes || renewalKA.uf_mes || 0)
                try {
                    const { error } = await supabase.rpc('crm_create_renewal', { p_key_account_id: kaId, p_start_date: start, p_end_date: end, p_uf_mes: uf, p_notes: renewalForm.notes || null })
                    if (error) throw error
                } catch {
                    await supabase.from('crm_renewals').update({ status: 'renewed' }).eq('key_account_id', kaId).eq('status', 'active')
                    await supabase.from('crm_renewals').insert([{ key_account_id: kaId, start_date: start, end_date: end, uf_mes: uf, status: 'active', notes: renewalForm.notes || null }])
                    await supabase.from('key_accounts').update({ inicio_contrato: start, fin_contrato: end, uf_mes: uf }).eq('id', kaId)
                }
                await logEvent('key_accounts', kaId, 'renewal_created', 'Renovación registrada', { start_date: start, end_date: end, uf_mes: uf })
                await loadKeyAccounts()
            }
            closeRenewal()
        } catch (error) { showToast('Error: ' + (error as Error).message, 'error') }
    }

    const transitionEntityMap: Record<string, string> = { 'prospectos': 'prospecto', 'tickets': 'ticket', 'key_accounts': 'key_account', 'cerrados': 'cerrado' }

    const openHistory = async (entityType: string, entityId: string, title = '') => {
        if (!requireAuth()) return
        setHistoryOpen(true); setHistoryLoading(true)
        setHistoryTitle(title || `${entityType} ${entityId}`)
        try {
            const { data: events, error: evErr } = await supabase.from('crm_events').select('event_type,title,payload,created_at,created_by_email').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false }).limit(200)
            if (evErr) throw evErr
            const transitionType = transitionEntityMap[entityType] || entityType
            const { data: transitions, error: trErr } = await supabase.from('crm_transitions').select('created_at,entity_from,entity_from_id,entity_to,entity_to_id,reason,notes').or(`and(entity_from.eq.${transitionType},entity_from_id.eq.${entityId}),and(entity_to.eq.${transitionType},entity_to_id.eq.${entityId})`).order('created_at', { ascending: false }).limit(200)
            if (trErr) console.warn('No se pudieron cargar transiciones:', trErr.message)

            let links: AnyRecord[] = []
            try {
                const et = transitionType
                const { data: lnk, error: lnkErr } = await supabase.from('crm_entity_links').select('created_at,from_type,from_id,to_type,to_id,reason,notes').or(`and(from_type.eq.${et},from_id.eq.${entityId}),and(to_type.eq.${et},to_id.eq.${entityId})`).order('created_at', { ascending: false }).limit(200)
                if (lnkErr) throw lnkErr
                links = lnk || []
            } catch (e) { console.warn('No se pudieron cargar crm_entity_links:', (e as Error)?.message || e) }

            const items = [
                ...(events || []).map((e: AnyRecord) => ({ kind: 'event', created_at: e.created_at, label: (e.event_type || 'event').toUpperCase(), title: e.title || '', email: e.created_by_email || '', payload: e.payload })),
                ...((transitions || []) as AnyRecord[]).map(t => ({ kind: 'transition', created_at: t.created_at, label: 'TRANSICIÓN', title: t.reason || '', email: '', payload: { from: t.entity_from, to: t.entity_to, notes: t.notes } })),
                ...links.map(l => ({ kind: 'link', created_at: l.created_at, label: 'TRANSICIÓN', title: l.reason || '', email: '', payload: { from: l.from_type, to: l.to_type, notes: l.notes, from_id: l.from_id, to_id: l.to_id } }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

            setHistoryItems(items)
        } catch (err) {
            console.error('Error cargando historial:', err)
            showToast('No se pudo cargar el historial: ' + ((err as Error)?.message || err), 'error')
            setHistoryItems([])
        } finally { setHistoryLoading(false) }
    }

    const loadFiles = async (entityType: string, entityId: string) => {
        setFilesLoading(true)
        try {
            const { data, error } = await supabase.storage.from('crm-archivos').list(`${entityType}/${entityId}`)
            if (error) throw error
            setFilesList(data || [])
        } catch (err) { console.error('Error cargando archivos:', err); setFilesList([]) }
        finally { setFilesLoading(false) }
    }

    const openFilesModal = async (entityType: string, entityId: string, entityName: string) => {
        if (!requireAuth()) return
        setFilesEntityType(entityType); setFilesEntityId(entityId); setFilesEntityName(entityName)
        setFilesModalOpen(true)
        await loadFiles(entityType, entityId)
    }

    const uploadFile = async (file: File) => {
        if (!file) return
        setUploadingFile(true)
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`
            const filePath = `${folderPath}/${Date.now()}_${file.name}`
            const { error: uploadError } = await supabase.storage.from('crm-archivos').upload(filePath, file)
            if (uploadError) throw uploadError
            await logEvent(filesEntityType!, filesEntityId!, 'file_uploaded', `Archivo subido: ${file.name}`, { filename: file.name, size: file.size, type: file.type })
            await loadFiles(filesEntityType!, filesEntityId!)
            showToast('Archivo subido correctamente', 'info')
        } catch (err) { showToast('Error al subir archivo: ' + (err as Error).message, 'error') }
        finally { setUploadingFile(false) }
    }

    const downloadFile = async (fileName: string) => {
        try {
            const { data, error } = await supabase.storage.from('crm-archivos').download(`${filesEntityType}/${filesEntityId}/${fileName}`)
            if (error) throw error
            const url = URL.createObjectURL(data)
            const a = document.createElement('a')
            a.href = url; a.download = fileName.split('_').slice(1).join('_'); a.click()
            URL.revokeObjectURL(url)
        } catch (err) { showToast('Error al descargar: ' + (err as Error).message, 'error') }
    }

    const deleteFile = async (fileName: string) => {
        const confirmed = await confirmModal(`¿Estás seguro que quieres eliminar el archivo "${fileName}"?\n\nEsta acción no se puede deshacer.`, { title: 'Eliminar archivo', confirmLabel: 'Eliminar', danger: true })
        if (!confirmed) return
        try {
            const { error } = await supabase.storage.from('crm-archivos').remove([`${filesEntityType}/${filesEntityId}/${fileName}`])
            if (error) throw error
            await logEvent(filesEntityType!, filesEntityId!, 'file_deleted', `Archivo eliminado: ${fileName}`, { filename: fileName })
            await loadFiles(filesEntityType!, filesEntityId!)
            showToast('Archivo eliminado', 'info')
        } catch (err) { showToast('Error al eliminar: ' + (err as Error).message, 'error') }
    }

    const getFileIcon = (fileName: string): string => {
        const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️'
        if (ext === 'pdf') return '📄'
        if (['doc', 'docx'].includes(ext)) return '📝'
        if (['xls', 'xlsx'].includes(ext)) return '📊'
        if (['zip', 'rar'].includes(ext)) return '📦'
        return '📎'
    }

    const handleSaveProspecto = async (formData: AnyRecord) => {
        if (!requireAuth()) return
        try {
            let savedId: string | null = null
            if (editingItem) {
                const cambios: AnyRecord = {}
                Object.keys(formData).forEach(key => { if (editingItem[key] !== formData[key]) cambios[key] = { anterior: editingItem[key], nuevo: formData[key] } })
                const { error } = await supabase.from('prospectos').update(formData).eq('id', editingItem.id)
                if (error) throw error
                savedId = editingItem.id
                if (Object.keys(cambios).length > 0) await logEvent('prospectos', savedId!, 'updated', 'Prospecto actualizado', { changed_fields: Object.keys(cambios), changes: cambios, updated_by: user?.email || 'unknown' })
            } else {
                const { data: inserted, error } = await supabase.from('prospectos').insert([formData]).select('id').single()
                if (error) throw error
                savedId = (inserted as { id: string })?.id
                await logEvent('prospectos', savedId!, 'created', 'Prospecto creado', { organizacion: formData.organizacion, valor: formData.valor, tipo: formData.tipo, created_by: user?.email || 'unknown' })
            }
            await loadProspectos(); setShowModal(false)
        } catch (error) { showToast('Error al guardar: ' + (error as Error).message, 'error') }
    }

    const handleDeleteProspecto = async (id: string) => {
        if (!requireAuth()) return
        const prospecto = prospectos.find(p => p.id === id)
        const label = prospecto?.organizacion ? `el prospecto de "${prospecto.organizacion}"` : 'este prospecto'
        const confirmed = await confirmModal(`¿Estás seguro que quieres eliminar ${label}?\n\nEsta acción no se puede deshacer.`, { title: 'Eliminar prospecto', confirmLabel: 'Eliminar', danger: true })
        if (!confirmed) return
        const { error } = await supabase.from('prospectos').delete().eq('id', id)
        if (error) showToast('Error: ' + error.message, 'error')
        else await loadProspectos()
    }

    const handleMoveProspecto = async (prospectoId: string, nuevoEstado: string) => {
        if (!requireAuth()) return
        const prospecto = prospectos.find(p => p.id === prospectoId)
        const estadoAnterior = prospecto?.estado
        const PROBABILIDAD_POR_ESTADO: Record<string, number> = { 'Lead nuevo': 5, 'Contactado': 15, 'Reunión agendada': 25, 'Propuesta enviada': 40, 'Negociación': 70 }
        const probabilidad = PROBABILIDAD_POR_ESTADO[nuevoEstado] ?? 10
        const { error } = await supabase.from('prospectos').update({ estado: nuevoEstado, probabilidad }).eq('id', prospectoId)
        if (error) { console.error('Error:', error) }
        else {
            await logEvent('prospectos', prospectoId, 'stage_changed', `Movido a "${nuevoEstado}"`, { from: estadoAnterior, to: nuevoEstado, probabilidad, moved_by: user?.email || 'unknown' })
            await loadProspectos()
        }
    }

    const handleCerrarProspecto = async (prospecto: Prospecto, ganado: boolean) => {
        if (!requireAuth()) return
        try {
            const cerrado = { organizacion: prospecto.organizacion, tipo: prospecto.tipo, estado_final: ganado ? 'Ganado' : 'Perdido', fecha_cierre: new Date().toISOString().split('T')[0], valor: prospecto.valor, razon_perdida: '', escalo: false, valor_total_final: prospecto.valor, fecha_contacto: prospecto.created_at }
            const { error: insertError } = await supabase.from('cerrados').insert([cerrado])
            if (insertError) throw insertError
            await logEvent('prospectos', prospecto.id, 'closed', `Cerrado como "${ganado ? 'Ganado' : 'Perdido'}"`, { estado_final: ganado ? 'Ganado' : 'Perdido', valor: prospecto.valor, closed_by: user?.email || 'unknown' })
            const { error: deleteError } = await supabase.from('prospectos').delete().eq('id', prospecto.id)
            if (deleteError) throw deleteError
            await loadProspectos(); await loadCerrados()
        } catch (error) { showToast('Error: ' + (error as Error).message, 'error') }
    }

    const handleSaveOther = async (type: string, formData: AnyRecord) => {
        if (!requireAuth()) return
        try {
            const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts'
            if (editingItem) {
                const { error } = await supabase.from(table).update(formData).eq('id', editingItem.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from(table).insert([formData])
                if (error) throw error
            }
            if (type === 'cerrado') await loadCerrados()
            if (type === 'ticket') await loadTickets()
            if (type === 'keyaccount') await loadKeyAccounts()
            setShowModal(false)
        } catch (error) { showToast('Error: ' + (error as Error).message, 'error') }
    }

    const handleDeleteOther = async (type: string, id: string) => {
        if (!requireAuth()) return
        const lists: Record<string, AnyRecord[]> = { cerrado: cerrados as AnyRecord[], ticket: tickets as AnyRecord[], keyaccount: keyAccounts as AnyRecord[] }
        const item = (lists[type] || []).find(x => x.id === id)
        const typeLabel = ({ cerrado: 'el cerrado', ticket: 'el ticket', keyaccount: 'el key account' } as Record<string, string>)[type] || 'el registro'
        const orgLabel = item?.organizacion ? ` de "${item.organizacion}"` : ''
        const titleByType = ({ cerrado: 'Eliminar cerrado', ticket: 'Eliminar ticket', keyaccount: 'Eliminar key account' } as Record<string, string>)[type] || 'Eliminar'
        const confirmed = await confirmModal(`¿Estás seguro que quieres eliminar ${typeLabel}${orgLabel}?\n\nEsta acción no se puede deshacer.`, { title: titleByType, confirmLabel: 'Eliminar', danger: true })
        if (!confirmed) return
        const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts'
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) showToast('Error: ' + error.message, 'error')
        else {
            if (type === 'cerrado') await loadCerrados()
            if (type === 'ticket') await loadTickets()
            if (type === 'keyaccount') await loadKeyAccounts()
        }
    }

    const handleCloseTicket = (ticket: AnyRecord) => {
        if (!requireAuth() || !ticket) return
        setCloseTicketTarget(ticket); setCloseTicketOpen(true)
    }

    const closeCloseTicketModal = () => { setCloseTicketOpen(false); setCloseTicketTarget(null) }

    const submitCloseTicket = async ({ alsoClosed, closedOutcome, ufValue, lossReason }: { alsoClosed: boolean; closedOutcome: string; ufValue: string; lossReason: string }) => {
        const ticket = closeTicketTarget
        if (!ticket) throw new Error('No hay ticket seleccionado')

        const { error } = await supabase.from('tickets').update({ status: 'Cerrado', porcentaje_avance: 100, fase_actual: ticket.fase_actual || 'Finalizado', updated_at: new Date().toISOString() }).eq('id', ticket.id)
        if (error) throw new Error(error.message)

        await logEvent('tickets', ticket.id, 'ticket_closed', 'Ticket finalizado', { status: 'Cerrado', outcome: alsoClosed ? closedOutcome : null })

        if (alsoClosed) {
            const today = new Date().toISOString().split('T')[0]
            const ufParsed = ufValue ? parseFloat(ufValue) : null
            const closedRow = { organizacion: ticket.organizacion, tipo: ticket.ticket, estado_final: closedOutcome, fecha_cierre: today, valor: ufParsed, razon_perdida: closedOutcome === 'Perdido' ? (lossReason || null) : null, escalo: !!ticket.escalo, valor_total_final: ufParsed, fecha_contacto: today }
            const { data: cData, error: cErr } = await supabase.from('cerrados').insert([closedRow]).select('*').single()
            if (cErr) { console.warn('No se pudo registrar ticket en cerrados:', cErr.message); showToast(`Ticket cerrado, pero no se pudo registrar en Historial: ${cErr.message}`, 'warning') }
            else if ((cData as AnyRecord)?.id) {
                try { await supabase.from('crm_entity_links').insert([{ from_type: 'ticket', from_id: ticket.id, to_type: 'cerrado', to_id: (cData as AnyRecord).id, link_type: 'completion' }]) } catch { /* no-op */ }
                await logEvent('cerrados', (cData as AnyRecord).id, 'ticket_closed_recorded', 'Ticket registrado en Cerrados', { ticket_id: ticket.id, outcome: closedOutcome })
                await loadCerrados()
            }
        }
        await loadTickets()
        showToast('✅ Ticket finalizado', 'success')
        closeCloseTicketModal()
    }

    return {
        historyOpen, historyLoading, historyTitle, historyItems, setHistoryItems, openHistory, setHistoryOpen,
        convertOpen, convertSource, convertTarget, convertForm, openConvert, openConvertFromCerrado, closeConvert, setConvertTarget, setConvertForm, submitConvert,
        renewalOpen, renewalKA, renewalMode, renewalForm, cancelAlsoRegisterLoss, openRenewal, openCancelKA, closeRenewal, setRenewalForm, setCancelAlsoRegisterLoss, submitRenewal,
        filesModalOpen, filesEntityType, filesEntityId, filesEntityName, filesList, filesLoading, uploadingFile, openFilesModal, setFilesModalOpen,
        closeTicketOpen, closeTicketTarget, closeCloseTicketModal, submitCloseTicket,
        selectedEntity, openDetail, setSelectedEntity,
        handleSaveProspecto, handleDeleteProspecto, handleMoveProspecto, handleCerrarProspecto, handleSaveOther, handleDeleteOther, handleCloseTicket,
        uploadFile, downloadFile, deleteFile, getFileIcon
    }
}
