import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { showToast, confirmModal } from '../utils/toast'

export default function useCRMActions({ user, data, loaders }) {
    const { prospectos, setProspectos, cerrados, setCerrados, tickets, setTickets, keyAccounts, setKeyAccounts } = data;
    const { loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas, loadActividad } = loaders;

    // History modal
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyTitle, setHistoryTitle] = useState('');
    const [historyItems, setHistoryItems] = useState([]);

    // Convert modal
    const [convertOpen, setConvertOpen] = useState(false);
    const [convertSource, setConvertSource] = useState({ type: 'prospecto', item: null });
    const [convertTarget, setConvertTarget] = useState('ticket');
    const [convertForm, setConvertForm] = useState({ ticket: '', fecha_inicio: '', fecha_entrega: '', responsable: '', servicio: '', uf_mes: '', inicio_contrato: '', fin_contrato: '', notes: '' });

    // Renewal modal
    const [renewalOpen, setRenewalOpen] = useState(false);
    const [renewalKA, setRenewalKA] = useState(null);
    const [renewalMode, setRenewalMode] = useState('renew');
    const [renewalForm, setRenewalForm] = useState({ start_date: '', end_date: '', uf_mes: '', cancel_reason: '', notes: '' });
    const [cancelAlsoRegisterLoss, setCancelAlsoRegisterLoss] = useState(true);

    // Files modal
    const [filesModalOpen, setFilesModalOpen] = useState(false);
    const [filesEntityType, setFilesEntityType] = useState(null);
    const [filesEntityId, setFilesEntityId] = useState(null);
    const [filesEntityName, setFilesEntityName] = useState('');
    const [filesList, setFilesList] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);

    // Entity detail
    const [selectedEntity, setSelectedEntity] = useState(null);
    const openDetail = (type, item) => setSelectedEntity({ type, item });

    const requireAuth = () => {
        if (user) return true;
        showToast('Debes iniciar sesión para realizar esta acción', 'error');
        return false;
    };


    const logEvent = async (entityType, entityId, eventType, title, payload = {}) => {
        try {
            if (!user || !entityType || !entityId || !eventType || !title) return;

            await supabase.from('crm_events').insert([{
                entity_type: entityType,
                entity_id: entityId,
                event_type: eventType,
                title,
                payload,
                created_by: user?.id || null,
                created_by_email: user?.email || null
            }]);
        } catch (e) {
            console.warn('logEvent failed', e?.message || e);
        }
    };

    const openConvert = (prospecto, targetType = 'ticket') => {
        setConvertSource({ type: 'prospecto', item: prospecto });
        const today = new Date().toISOString().split('T')[0];
        const defaultEntrega = prospecto?.fecha_limite || today;
        setConvertTarget(targetType === 'keyaccount' ? 'keyaccount' : 'ticket');
        setConvertForm({
            ticket: `Ejecución - ${prospecto?.organizacion || ''}`.trim(),
            fecha_inicio: today,
            fecha_entrega: defaultEntrega,
            responsable: '',
            servicio: prospecto?.tipo || 'Servicio',
            uf_mes: String(prospecto?.valor ?? ''),
            inicio_contrato: today,
            fin_contrato: defaultEntrega,
            notes: ''
        });
        setConvertOpen(true);
    };

    const openConvertFromCerrado = (cerrado) => {
        setConvertSource({ type: 'cerrado', item: cerrado });
        const today = new Date().toISOString().split('T')[0];
        // En cerrados no hay fecha_limite: proponemos hoy como punto de partida
        setConvertTarget('ticket');
        setConvertForm({
            ticket: `Ejecución - ${cerrado?.organizacion || ''}`.trim(),
            fecha_inicio: today,
            fecha_entrega: today,
            responsable: '',
            servicio: cerrado?.tipo || 'Servicio',
            uf_mes: String(cerrado?.valor ?? ''),
            inicio_contrato: today,
            fin_contrato: today,
            notes: ''
        });
        setConvertOpen(true);
    };

    const closeConvert = () => {
        setConvertOpen(false);
        setConvertSource({ type: 'prospecto', item: null });
    };

    const submitConvert = async () => {
    if (!requireAuth()) return;
    const sourceType = convertSource?.type;
    const source = convertSource?.item;
    if (!sourceType || !source) return;

    try {
        const fromId = source.id;
        const fromEntityType = (sourceType === 'prospecto') ? 'prospectos' : 'cerrados';
        const transitionFrom = (sourceType === 'prospecto') ? 'prospecto' : 'cerrado';

        // 1) Crear entidad destino
        let toType = null;   // 'ticket' | 'key_account'
        let toId = null;

        if (convertTarget === 'ticket') {
            const ticketRow = {
    organizacion: source.organizacion,
    ticket: convertForm.ticket || `Ejecución - ${source.organizacion}`,
    fecha_inicio: convertForm.fecha_inicio,
    fecha_entrega: convertForm.fecha_entrega,
    fase_actual: 'Inicio',
    porcentaje_avance: 0,
    responsable: convertForm.responsable || '',
    satisfaccion: null,
    escalo: false,
    proxima_accion: (sourceType === 'prospecto' ? (source.proximo_paso || '') : ''),
    status: 'Activo'
            };
            const { data, error } = await supabase.from('tickets').insert([ticketRow]).select('id').single();
            if (error) throw error;
            toType = 'ticket';
            toId = data.id;

            await logEvent('tickets', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId });
        } else {
            const kaRow = {
    organizacion: source.organizacion,
    servicio: convertForm.servicio || source.tipo || 'Servicio',
    uf_mes: Number(convertForm.uf_mes || source.valor || 0),
    inicio_contrato: convertForm.inicio_contrato,
    fin_contrato: convertForm.fin_contrato,
    renovacion: 'Mensual',
    salud: 'OK',
    ultima_reunion: null,
    proxima_reunion: null,
    valor_uf_cierre: null,
    fecha_cierre_uf: null
            };
            const { data, error } = await supabase.from('key_accounts').insert([kaRow]).select('id').single();
            if (error) throw error;
            toType = 'key_account';
            toId = data.id;

            // Seed de renovación activa (si existe tabla)
            try {
    await supabase.from('crm_renewals').insert([{
        key_account_id: toId,
        start_date: kaRow.inicio_contrato,
        end_date: kaRow.fin_contrato,
        uf_mes: kaRow.uf_mes,
        status: 'active',
        notes: `Seed desde conversión (${transitionFrom})`
    }]);
            } catch (e) { /* no-op */ }

            await logEvent('key_accounts', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId });
        }

        // 2) Guardar link (origen -> destino)
        try {
            await supabase.from('crm_entity_links').insert([{
    from_type: transitionFrom,
    from_id: fromId,
    to_type: toType,
    to_id: toId,
    link_type: 'transition'
            }]);
        } catch (e) { /* no-op */ }

        // 2.1) Guardar transición (si existe la tabla crm_transitions)
        try {
            await supabase.from('crm_transitions').insert([{
    entity_from: transitionFrom,
    entity_from_id: fromId,
    entity_to: toType,
    entity_to_id: toId,
    reason: 'Conversión',
    notes: convertForm.notes || null,
    created_by_email: user?.email || null
            }]);
        } catch (e) { /* no-op */ }

        // 3) Si venimos desde prospecto: registrar como GANADO en Historial + marcar como convertido
        if (sourceType === 'prospecto') {
            // 3.1) Guardar en Historial como Ganado
            const cerradoGanado = {
    organizacion: source.organizacion,
    tipo: source.tipo,
    estado_final: 'Ganado',
    fecha_cierre: new Date().toISOString().split('T')[0],
    valor: source.valor,
    razon_perdida: '',
    escalo: false,
    valor_total_final: source.valor,
    fecha_contacto: source.created_at
            };

            try {
    await supabase.from('cerrados').insert([cerradoGanado]);
            } catch (e) {
    console.warn('No se pudo guardar en Historial:', e);
            }

            // 3.2) Marcar prospecto como convertido (no lo borramos)
            const { error: updErr } = await supabase.from('prospectos')
    .update({ estado: 'Convertido', proximo_paso: `Convertido a ${toType === 'ticket' ? 'Ticket' : 'Key Account'}` })
    .eq('id', fromId);
            if (updErr) throw updErr;
        }

        await logEvent(fromEntityType, fromId, 'converted', `${transitionFrom} convertido`, { to_type: toType, to_id: toId });

        // 4) Refresh
        await loadProspectos();
        await loadCerrados();
        await loadTickets();
        await loadKeyAccounts();

        closeConvert();
    } catch (error) {
        alert('Error al convertir: ' + error.message);
    }

    };

    // -------------------------
    // Renovaciones (Key Accounts)
    // -------------------------
    const openRenewal = (ka) => {
        const today = new Date().toISOString().split('T')[0];
        const end = ka?.fin_contrato || today;
        setRenewalKA(ka);
        setRenewalMode('renew');
        setRenewalForm({
            start_date: today,
            end_date: end,
            uf_mes: String(ka?.uf_mes ?? ''),
            cancel_reason: '',
            notes: ''
        });
        setRenewalOpen(true);
    };

    const openCancelKA = (ka) => {
        const today = new Date().toISOString().split('T')[0];
        setRenewalKA(ka);
        setRenewalMode('cancel');
        setCancelAlsoRegisterLoss(true);
        setRenewalForm({
            start_date: today,
            end_date: ka?.fin_contrato || today,
            uf_mes: String(ka?.uf_mes ?? ''),
            cancel_reason: '',
            notes: ''
        });
        setRenewalOpen(true);
    };

    const closeRenewal = () => {
        setRenewalOpen(false);
        setRenewalKA(null);
    };

    const submitRenewal = async () => {
        if (!requireAuth()) return;
        if (!renewalKA) return;

        try {
            const kaId = renewalKA.id;

            if (renewalMode === 'cancel') {
                // intenta RPC
                try {
                    const { error } = await supabase.rpc('crm_cancel_key_account', {
                        p_key_account_id: kaId,
                        p_cancel_reason: renewalForm.cancel_reason || null,
                        p_notes: renewalForm.notes || null
                    });
                    if (error) throw error;
                } catch (e) {
                    // fallback: marcar renewal activa como cancelada
                    await supabase.from('crm_renewals')
                        .update({ status: 'cancelled', cancel_reason: renewalForm.cancel_reason || null, notes: renewalForm.notes || null })
                        .eq('key_account_id', kaId)
                        .eq('status', 'active');
                }

                await logEvent('key_accounts', kaId, 'renewal_cancelled', 'Contrato cancelado', { cancel_reason: renewalForm.cancel_reason || null });

                // Marcamos el Key Account como cerrado para que salga del listado activo
                await supabase.from('key_accounts')
                    .update({ salud: 'Cerrado', updated_at: new Date().toISOString() })
                    .eq('id', kaId);

                // opcional: registrar pérdida en Cerrados (para visibilidad directiva)
                if (cancelAlsoRegisterLoss) {
                    const today = new Date().toISOString().split('T')[0];
                    const closedRow = {
                        organizacion: renewalKA.organizacion,
                        tipo: renewalKA.servicio,
                        estado_final: 'Perdido',
                        fecha_cierre: today,
                        valor: renewalKA.uf_mes,
                        razon_perdida: renewalForm.cancel_reason || '',
                        escalo: false,
                        valor_total_final: renewalKA.uf_mes,
                        fecha_contacto: today
                    };
                    const { error: cerrErr } = await supabase.from('cerrados').insert([closedRow]);
                    if (!cerrErr) {
                        // evento espejo para el cerrado creado (si podemos recuperar id, ideal; aquí dejamos evento solo en KA)
                        await loadCerrados();
                    } else {
                        console.warn('No se pudo registrar en cerrados:', cerrErr.message);
                    }
                }

            } else {
                const start = renewalForm.start_date;
                const end = renewalForm.end_date;
                const uf = Number(renewalForm.uf_mes || renewalKA.uf_mes || 0);

                // intenta RPC
                try {
                    const { error } = await supabase.rpc('crm_create_renewal', {
                        p_key_account_id: kaId,
                        p_start_date: start,
                        p_end_date: end,
                        p_uf_mes: uf,
                        p_notes: renewalForm.notes || null
                    });
                    if (error) throw error;
                } catch (e) {
                    // fallback: cierre renewal activa + insert nueva + update key_accounts
                    await supabase.from('crm_renewals')
                        .update({ status: 'renewed' })
                        .eq('key_account_id', kaId)
                        .eq('status', 'active');

                    await supabase.from('crm_renewals').insert([{
                        key_account_id: kaId,
                        start_date: start,
                        end_date: end,
                        uf_mes: uf,
                        status: 'active',
                        notes: renewalForm.notes || null
                    }]);

                    await supabase.from('key_accounts')
                        .update({ inicio_contrato: start, fin_contrato: end, uf_mes: uf })
                        .eq('id', kaId);
                }

                await logEvent('key_accounts', kaId, 'renewal_created', 'Renovación registrada', { start_date: start, end_date: end, uf_mes: uf });

                await loadKeyAccounts();
            }

            closeRenewal();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const transitionEntityMap = {
        'prospectos': 'prospecto',
        'tickets': 'ticket',
        'key_accounts': 'key_account',
        'cerrados': 'cerrado'
    };

    const openHistory = async (entityType, entityId, title = '') => {
        if (!requireAuth()) return;
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryTitle(title || `${entityType} ${entityId}`);
        setHistoryEntityType(entityType);
        setHistoryEntityId(entityId);
        try {
            const { data: events, error: evErr } = await supabase
                .from('crm_events')
                .select('event_type,title,payload,created_at,created_by_email')
                .eq('entity_type', entityType)
                .eq('entity_id', entityId)
                .order('created_at', { ascending: false })
                .limit(200);

            if (evErr) throw evErr;

            const transitionType = transitionEntityMap[entityType] || entityType;
            const { data: transitions, error: trErr } = await supabase
                .from('crm_transitions')
                .select('created_at,entity_from,entity_from_id,entity_to,entity_to_id,reason,notes')
                .or(`and(entity_from.eq.${transitionType},entity_from_id.eq.${entityId}),and(entity_to.eq.${transitionType},entity_to_id.eq.${entityId})`)
                .order('created_at', { ascending: false })
                .limit(200);

            if (trErr) {
                // Si no existe la tabla o hay RLS, no bloqueamos el historial de eventos
                console.warn('No se pudieron cargar transiciones:', trErr.message);
            }

            
            // También intentamos cargar vínculos/transiciones desde crm_entity_links (si existe)
            let links = [];
            try {
                const et = transitionType;
                const { data: lnk, error: lnkErr } = await supabase
                    .from('crm_entity_links')
                    .select('created_at,from_type,from_id,to_type,to_id,reason,notes')
                    .or(`and(from_type.eq.${et},from_id.eq.${entityId}),and(to_type.eq.${et},to_id.eq.${entityId})`)
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (lnkErr) throw lnkErr;
                links = lnk || [];
            } catch (e) {
                console.warn('No se pudieron cargar crm_entity_links:', e?.message || e);
            }
            const items = [
                ...(events || []).map(e => ({
                    kind: 'event',
                    created_at: e.created_at,
                    label: (e.event_type || 'event').toUpperCase(),
                    title: e.title || '',
                    email: e.created_by_email || '',
                    payload: e.payload
                })),
                ...((transitions || []) || []).map(t => ({
                    kind: 'transition',
                    created_at: t.created_at,
                    label: 'TRANSICIÓN',
                    title: t.reason || '',
                    email: '',
                    payload: { from: t.entity_from, to: t.entity_to, notes: t.notes }
                })),
                ...(links || []).map(l => ({
                    kind: 'link',
                    created_at: l.created_at,
                    label: 'TRANSICIÓN',
                    title: l.reason || '',
                    email: '',
                    payload: { from: l.from_type, to: l.to_type, notes: l.notes, from_id: l.from_id, to_id: l.to_id }
                }))
            ].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

            setHistoryItems(items);
        } catch (err) {
            console.error('Error cargando historial:', err);
            alert('No se pudo cargar el historial: ' + (err?.message || err));
            setHistoryItems([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const openFilesModal = async (entityType, entityId, entityName) => {
        if (!requireAuth()) return;
        setFilesEntityType(entityType);
        setFilesEntityId(entityId);
        setFilesEntityName(entityName);
        setFilesModalOpen(true);
        await loadFiles(entityType, entityId);
    };

    const loadFiles = async (entityType, entityId) => {
        setFilesLoading(true);
        try {
            const folderPath = `${entityType}/${entityId}`;
            const { data, error } = await supabase.storage
                .from('crm-archivos')
                .list(folderPath);
            
            if (error) throw error;
            setFilesList(data || []);
        } catch (err) {
            console.error('Error cargando archivos:', err);
            setFilesList([]);
        } finally {
            setFilesLoading(false);
        }
    };

    const uploadFile = async (file) => {
        if (!file) return;
        setUploadingFile(true);
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const fileName = `${Date.now()}_${file.name}`;
            const filePath = `${folderPath}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('crm-archivos')
                .upload(filePath, file);
            
            if (uploadError) throw uploadError;
            
            // Registrar en historial
            await logEvent(
                filesEntityType, 
                filesEntityId, 
                'file_uploaded', 
                `Archivo subido: ${file.name}`,
                { filename: file.name, size: file.size, type: file.type }
            );
            
            await loadFiles(filesEntityType, filesEntityId);
            showToast('Archivo subido correctamente', 'info');
        } catch (err) {
            console.error('Error subiendo archivo:', err);
            alert('Error al subir archivo: ' + err.message);
        } finally {
            setUploadingFile(false);
        }
    };

    const downloadFile = async (fileName) => {
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const { data, error } = await supabase.storage
                .from('crm-archivos')
                .download(`${folderPath}/${fileName}`);
            
            if (error) throw error;
            
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.split('_').slice(1).join('_'); // Remover timestamp
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error descargando archivo:', err);
            alert('Error al descargar: ' + err.message);
        }
    };

    const deleteFile = async (fileName) => {
        if (!(await confirmModal('¿Eliminar este archivo?'))) return;
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const { error } = await supabase.storage
                .from('crm-archivos')
                .remove([`${folderPath}/${fileName}`]);
            
            if (error) throw error;
            
            // Registrar en historial
            await logEvent(
                filesEntityType, 
                filesEntityId, 
                'file_deleted', 
                `Archivo eliminado: ${fileName}`,
                { filename: fileName }
            );
            
            await loadFiles(filesEntityType, filesEntityId);
            showToast('Archivo eliminado', 'info');
        } catch (err) {
            console.error('Error eliminando archivo:', err);
            alert('Error al eliminar: ' + err.message);
        }
    };

    const getFileIcon = (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc', 'docx'].includes(ext)) return '📝';
        if (['xls', 'xlsx'].includes(ext)) return '📊';
        if (['zip', 'rar'].includes(ext)) return '📦';
        return '📎';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const handleSaveProspecto = async (data) => {
        if (!requireAuth()) return false;
        try {
            let savedId = null;
            const editingId = data?.id || null;
            const editingSource = editingId ? (prospectos.find((p) => p.id === editingId) || data) : null;
            if (editingId) {
                // UPDATE: registrar qué cambió
                const cambios = {};
                Object.keys(data).forEach(key => {
                    if (editingSource?.[key] !== data[key]) {
                        cambios[key] = { anterior: editingSource?.[key], nuevo: data[key] };
                    }
                });

                const payload = { ...data };
                delete payload.id;
                const { error } = await supabase.from('prospectos').update(payload).eq('id', editingId);
                if (error) throw error;
                
                savedId = editingId;
                
                // Log del update
                if (Object.keys(cambios).length > 0) {
                    await logEvent('prospectos', savedId, 'updated', 'Prospecto actualizado', {
                        changed_fields: Object.keys(cambios),
                        changes: cambios,
                        updated_by: user?.email || 'unknown'
                    });
                }
            } else {
                // INSERT: registrar creación
                const { data: inserted, error } = await supabase.from('prospectos').insert([data]).select('id').single();
                if (error) throw error;
                
                savedId = inserted?.id;
                
                // Log de creación
                await logEvent('prospectos', savedId, 'created', 'Prospecto creado', {
                    organizacion: data.organizacion,
                    valor: data.valor,
                    tipo: data.tipo,
                    created_by: user?.email || 'unknown'
                });
            }
            
            await loadProspectos();
            return true;
        } catch (error) { 
            console.error('Error completo:', error);
            alert('Error al guardar: ' + error.message); 
            return false;
        }
    };

    const handleDeleteProspecto = async (prospectoOrId) => {
        if (!requireAuth()) return;

        const prospecto = typeof prospectoOrId === 'object' ? prospectoOrId : prospectos.find(p => p.id === prospectoOrId);
        const prospectoId = prospecto?.id || prospectoOrId;

        if (!prospectoId) return;
        if (!(await confirmModal('¿Eliminar prospecto del pipeline?'))) return;

        const { error } = await supabase.from('prospectos').delete().eq('id', prospectoId);

        if (!error) {
            await logEvent('prospectos', prospectoId, 'deleted', 'Prospecto eliminado del pipeline', {
                deleted_by: user?.email || 'unknown'
            });
            await loadProspectos();
            showToast('🗑️ Prospecto eliminado del pipeline', 'success');
            return;
        }

        // Fallback: si no es posible borrar físicamente (RLS/FK), ocultar del pipeline
        const { error: hideError } = await supabase
            .from('prospectos')
            .update({ estado: 'Eliminado' })
            .eq('id', prospectoId);

        if (hideError) {
            alert('Error al eliminar: ' + error.message);
            return;
        }

        await logEvent('prospectos', prospectoId, 'hidden', 'Prospecto ocultado del pipeline (fallback)', {
            reason: error.message,
            hidden_by: user?.email || 'unknown'
        });
        await loadProspectos();
        showToast('⚠️ No se pudo borrar físicamente; se ocultó del pipeline.', 'info');
    };

    const handleMoveProspecto = async (prospectoId, nuevoEstado) => {
        if (!requireAuth()) return;
        
        // Obtener estado anterior
        const prospecto = prospectos.find(p => p.id === prospectoId);
        const estadoAnterior = prospecto?.estado;
        
        let probabilidad = 10;
        if (nuevoEstado === 'Reunión agendada') probabilidad = 25;
        if (nuevoEstado === 'Propuesta enviada') probabilidad = 40;
        if (nuevoEstado === 'Negociación') probabilidad = 70;
        
        const { error } = await supabase.from('prospectos').update({ estado: nuevoEstado, probabilidad }).eq('id', prospectoId);
        if (error) {
            console.error('Error:', error);
        } else {
            // Log del movimiento
            await logEvent('prospectos', prospectoId, 'stage_changed', `Movido a "${nuevoEstado}"`, {
                from: estadoAnterior,
                to: nuevoEstado,
                probabilidad: probabilidad,
                moved_by: user?.email || 'unknown'
            });
            await loadProspectos();
        }
    };

    const handleCerrarProspecto = async (prospecto, ganado) => {
        if (!requireAuth()) return;
        try {
            const cerrado = {
                organizacion: prospecto.organizacion,
                tipo: prospecto.tipo,
                estado_final: ganado ? 'Ganado' : 'Perdido',
                fecha_cierre: new Date().toISOString().split('T')[0],
                valor: prospecto.valor,
                razon_perdida: '',
                escalo: false,
                valor_total_final: prospecto.valor,
                fecha_contacto: prospecto.created_at
            };
            const { error: insertError } = await supabase.from('cerrados').insert([cerrado]);
            if (insertError) throw insertError;
            
            // Log antes de borrar
            await logEvent('prospectos', prospecto.id, 'closed', `Cerrado como "${ganado ? 'Ganado' : 'Perdido'}"`, {
                estado_final: ganado ? 'Ganado' : 'Perdido',
                valor: prospecto.valor,
                closed_by: user?.email || 'unknown'
            });
            
            const { error: deleteError } = await supabase.from('prospectos').delete().eq('id', prospecto.id);
            if (deleteError) throw deleteError;
            await loadProspectos();
            await loadCerrados();
        } catch (error) { alert('Error: ' + error.message); }
    };

    const handleSaveOther = async (type, data) => {
        if (!requireAuth()) return false;
        try {
            const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts';
            const editingId = data?.id || null;
            if (editingId) {
                const payload = { ...data };
                delete payload.id;
                const { error } = await supabase.from(table).update(payload).eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(table).insert([data]);
                if (error) throw error;
            }
            if (type === 'cerrado') await loadCerrados();
            if (type === 'ticket') await loadTickets();
            if (type === 'keyaccount') await loadKeyAccounts();
            return true;
        } catch (error) {
            alert('Error: ' + error.message);
            return false;
        }
    };

    const handleDeleteOther = async (type, id) => {
        if (!requireAuth()) return;
        if (!(await confirmModal('¿Eliminar?'))) return;
        const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts';
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else {
            if (type === 'cerrado') await loadCerrados();
            if (type === 'ticket') await loadTickets();
            if (type === 'keyaccount') await loadKeyAccounts();
        }
    };

    // -------------------------
    // Cerrar / finalizar Ticket
    // -------------------------
    const handleCloseTicket = async (ticket) => {
        if (!requireAuth()) return;
        if (!ticket) return;

        // 1) Finalizar ticket
        const ok = confirm(`¿Finalizar este ticket?

${ticket.organizacion} — ${ticket.ticket}

Se marcará como 100% y Cerrado.`);
        if (!ok) return;

        // 2) ¿Registrar también en "Cerrados"?
        const alsoClosed = confirm(`¿Quieres registrar el término del ticket en la pestaña "Cerrados"?

Recomendado: así queda como histórico y después puedes reactivarlo/convertirlo.`);
        let closedOutcome = 'Ganado';
        let lossReason = '';
        let ufValue = '';
        if (alsoClosed) {
            const opt = prompt('¿Cómo terminó este ticket?\n\n1 = Ganado (finalizado)\n2 = Perdido/Cancelado', '1');
            closedOutcome = (opt === '2') ? 'Perdido' : 'Ganado';
            ufValue = prompt('UF del ticket (opcional, para métricas). Deja vacío si no aplica.', '') || '';
            if (closedOutcome === 'Perdido') {
                lossReason = prompt('Motivo de pérdida/cancelación (opcional)', '') || '';
            }
        }

        try {
            const payload = {
                status: 'Cerrado',
                porcentaje_avance: 100,
                fase_actual: ticket.fase_actual || 'Finalizado',
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('tickets')
                .update(payload)
                .eq('id', ticket.id);

            if (error) throw error;

            await logEvent('tickets', ticket.id, 'ticket_closed', 'Ticket finalizado', { status: 'Cerrado', outcome: alsoClosed ? closedOutcome : null });

            // 3) Si corresponde, crear registro en "cerrados" + link + evento
            if (alsoClosed) {
                const today = new Date().toISOString().split('T')[0];
                const closedRow = {
                    organizacion: ticket.organizacion,
                    tipo: ticket.ticket,
                    estado_final: closedOutcome,
                    fecha_cierre: today,
                    valor: ufValue ? parseFloat(ufValue) : null,
                    razon_perdida: closedOutcome === 'Perdido' ? lossReason : null,
                    escalo: !!ticket.escalo,
                    valor_total_final: ufValue ? parseFloat(ufValue) : null,
                    fecha_contacto: today
                };

                const { data: cData, error: cErr } = await supabase
                    .from('cerrados')
                    .insert([closedRow])
                    .select('*')
                    .single();

                if (cErr) {
                    console.warn('No se pudo registrar ticket en cerrados:', cErr.message);
                } else if (cData?.id) {
                    // link suave (si existe)
                    try {
                        await supabase.from('crm_entity_links').insert([{
                            from_type: 'ticket',
                            from_id: ticket.id,
                            to_type: 'cerrado',
                            to_id: cData.id,
                            link_type: 'completion'
                        }]);
                    } catch (e) { /* no-op */ }

                    await logEvent('cerrados', cData.id, 'ticket_closed_recorded', 'Ticket registrado en Cerrados', { ticket_id: ticket.id, outcome: closedOutcome });
                    await loadCerrados();
                }
            }

            await loadTickets();
        } catch (err) {
            alert('Error al finalizar ticket: ' + (err?.message || err));
        }
    };



    return {
        // History
        historyOpen, historyLoading, historyTitle, historyItems, setHistoryItems,
        openHistory, setHistoryOpen,
        // Convert
        convertOpen, convertSource, convertTarget, convertForm,
        openConvert, openConvertFromCerrado, closeConvert, setConvertTarget, setConvertForm, submitConvert,
        // Renewal
        renewalOpen, renewalKA, renewalMode, renewalForm, cancelAlsoRegisterLoss,
        openRenewal, openCancelKA, closeRenewal, setRenewalForm, setCancelAlsoRegisterLoss, submitRenewal,
        // Files
        filesModalOpen, filesEntityType, filesEntityId, filesEntityName,
        filesList, filesLoading, uploadingFile,
        openFilesModal, setFilesModalOpen,
        // Detail
        selectedEntity, openDetail, setSelectedEntity,
        // CRUD
        handleSaveProspecto, handleDeleteProspecto, handleMoveProspecto,
        handleCerrarProspecto, handleSaveOther, handleDeleteOther, handleCloseTicket,
        // File operations
        uploadFile, downloadFile, deleteFile, getFileIcon
    };
}
