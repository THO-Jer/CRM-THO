import { useState, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'

const tipoIcons = { nota: '📝', llamada: '📞', reunion: '🤝', email: '📧', tarea: '✅' };
const tipoLabels = { nota: 'Nota', llamada: 'Llamada', reunion: 'Reunión', email: 'Email', tarea: 'Tarea' };

export default function EntityDetail({ entity, onClose, contactos, notas, user, onRefresh }) {
    const { type, item } = entity;
    const [activeSection, setActiveSection] = useState('timeline');
    const [newNota, setNewNota] = useState({ tipo: 'nota', contenido: '' });
    const [newContacto, setNewContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '' });
    const [saving, setSaving] = useState(false);

    const entityNotas = useMemo(() => 
        notas.filter(n => n.entidad_tipo === type && n.entidad_id === item.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        [notas, type, item.id]
    );

    const entityContactos = useMemo(() =>
        contactos.filter(c => c.organizacion?.toLowerCase() === (item.organizacion || '').toLowerCase()),
        [contactos, item.organizacion]
    );

    const org = item.organizacion || item.ticket || 'Sin nombre';
    
    const headerInfo = () => {
        switch (type) {
            case 'prospecto': return { badge: item.estado, color: 'bg-blue-100 text-blue-800', sub: `${item.tipo} · ${item.valor || 0} UF · ${item.probabilidad || 0}%` };
            case 'ticket': return { badge: item.status || 'Activo', color: 'bg-green-100 text-green-800', sub: `${item.ticket} · ${item.porcentaje_avance || 0}%` };
            case 'keyaccount': return { badge: item.salud || 'Activo', color: item.salud === 'Crítico' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800', sub: `${item.servicio || ''} · ${item.uf_mes || 0} UF/mes` };
            case 'cerrado': return { badge: item.estado_final, color: item.estado_final === 'Ganado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800', sub: `${item.tipo} · ${item.valor || 0} UF` };
            default: return { badge: '', color: '', sub: '' };
        }
    };
    const info = headerInfo();

    const handleAddNota = async () => {
        if (!newNota.contenido.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('notas').insert({
            entidad_tipo: type,
            entidad_id: item.id,
            tipo: newNota.tipo,
            contenido: newNota.contenido.trim(),
            created_by_email: user?.email || 'anon'
        });
        if (error) { showToast('Error al guardar nota', 'error'); console.error(error); }
        else { showToast('Nota agregada', 'success'); setNewNota({ tipo: 'nota', contenido: '' }); onRefresh(); }
        setSaving(false);
    };

    const handleAddContacto = async () => {
        if (!newContacto.nombre.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('contactos').insert({
            organizacion: item.organizacion || '',
            ...newContacto,
            created_by_email: user?.email || 'anon'
        });
        if (error) { showToast('Error al guardar contacto', 'error'); console.error(error); }
        else { showToast('Contacto agregado', 'success'); setNewContacto({ nombre: '', cargo: '', email: '', telefono: '' }); onRefresh(); }
        setSaving(false);
    };

    const handleDeleteNota = async (id) => {
        if (!confirm('¿Eliminar esta nota?')) return;
        await supabase.from('notas').delete().eq('id', id);
        showToast('Nota eliminada', 'info');
        onRefresh();
    };

    const handleToggleTarea = async (nota) => {
        await supabase.from('notas').update({ completada: !nota.completada }).eq('id', nota.id);
        onRefresh();
    };

    const handleDeleteContacto = async (id) => {
        if (!confirm('¿Eliminar este contacto?')) return;
        await supabase.from('contactos').delete().eq('id', id);
        showToast('Contacto eliminado', 'info');
        onRefresh();
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    const sections = [
        { id: 'timeline', label: '📋 Timeline', count: entityNotas.length },
        { id: 'contactos', label: '👤 Contactos', count: entityContactos.length },
        { id: 'detalle', label: '📄 Detalle' },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-8 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b dark:border-gray-700">
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${info.color}`}>{info.badge}</span>
                                <span className="text-xs text-gray-400 uppercase">{type}</span>
                            </div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 truncate">{org}</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{info.sub}</p>
                            {item.contacto && <p className="text-sm text-gray-500 mt-1">👤 {item.contacto}</p>}
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-4">✕</button>
                    </div>
                </div>

                {/* Section tabs */}
                <div className="flex border-b dark:border-gray-700 px-6">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`py-3 px-4 text-xs font-medium border-b-2 transition ${activeSection === s.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {s.label} {s.count !== undefined && <span className="ml-1 text-gray-400">({s.count})</span>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {/* TIMELINE */}
                    {activeSection === 'timeline' && (
                        <div className="space-y-4">
                            {/* Add nota form */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex gap-2 mb-2">
                                    {Object.entries(tipoLabels).map(([k, v]) => (
                                        <button key={k} onClick={() => setNewNota({...newNota, tipo: k})}
                                            className={`px-2 py-1 text-xs rounded-lg transition ${newNota.tipo === k ? 'bg-naranja text-white' : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 border dark:border-gray-500'}`}>
                                            {tipoIcons[k]} {v}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={newNota.contenido}
                                    onChange={e => setNewNota({...newNota, contenido: e.target.value})}
                                    placeholder={`Agregar ${tipoLabels[newNota.tipo].toLowerCase()}...`}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 resize-none"
                                />
                                <div className="flex justify-end mt-2">
                                    <button onClick={handleAddNota} disabled={saving || !newNota.contenido.trim()}
                                        className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">
                                        {saving ? 'Guardando...' : 'Agregar'}
                                    </button>
                                </div>
                            </div>

                            {/* Timeline */}
                            {entityNotas.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin actividades registradas</p>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>
                                    {entityNotas.map(n => (
                                        <div key={n.id} className="relative pl-10 pb-4 group">
                                            <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-white dark:bg-gray-800 border-2 border-naranja"></div>
                                            <div className="bg-white dark:bg-gray-700 rounded-lg p-3 border dark:border-gray-600 shadow-sm">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm">{tipoIcons[n.tipo] || '📝'}</span>
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tipoLabels[n.tipo] || n.tipo}</span>
                                                        {n.tipo === 'tarea' && (
                                                            <button onClick={() => handleToggleTarea(n)} className={`text-xs px-1.5 py-0.5 rounded ${n.completada ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
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
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* CONTACTOS */}
                    {activeSection === 'contactos' && (
                        <div className="space-y-4">
                            {/* Add contacto form */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Nuevo contacto en {item.organizacion}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={newContacto.nombre} onChange={e => setNewContacto({...newContacto, nombre: e.target.value})} placeholder="Nombre *" className="px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                                    <input value={newContacto.cargo} onChange={e => setNewContacto({...newContacto, cargo: e.target.value})} placeholder="Cargo" className="px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                                    <input value={newContacto.email} onChange={e => setNewContacto({...newContacto, email: e.target.value})} placeholder="Email" type="email" className="px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                                    <input value={newContacto.telefono} onChange={e => setNewContacto({...newContacto, telefono: e.target.value})} placeholder="Teléfono" className="px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                                </div>
                                <div className="flex justify-end mt-2">
                                    <button onClick={handleAddContacto} disabled={saving || !newContacto.nombre.trim()}
                                        className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">
                                        {saving ? 'Guardando...' : 'Agregar contacto'}
                                    </button>
                                </div>
                            </div>

                            {/* Contactos list */}
                            {entityContactos.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin contactos registrados</p>
                            ) : (
                                <div className="space-y-2">
                                    {entityContactos.map(c => (
                                        <div key={c.id} className="bg-white dark:bg-gray-700 rounded-lg p-3 border dark:border-gray-600 flex items-center gap-3 group">
                                            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-300 flex-shrink-0">
                                                {(c.nombre || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.nombre}</span>
                                                    {c.es_principal && <span className="text-[9px] bg-naranja text-white px-1.5 py-0.5 rounded">Principal</span>}
                                                </div>
                                                {c.cargo && <p className="text-xs text-gray-500 dark:text-gray-400">{c.cargo}</p>}
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {c.email && <span className="text-xs text-azul">{c.email}</span>}
                                                    {c.telefono && <span className="text-xs text-gray-500">{c.telefono}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteContacto(c.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* DETALLE */}
                    {activeSection === 'detalle' && (
                        <div className="space-y-3">
                            {Object.entries(item).filter(([k]) => !['id','created_at','created_by_email','updated_at'].includes(k) && item[k] != null && item[k] !== '').map(([key, val]) => (
                                <div key={key} className="flex justify-between items-start py-2 border-b dark:border-gray-700 last:border-0">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-40 flex-shrink-0">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                    <span className="text-sm text-gray-800 dark:text-gray-200 text-right">{typeof val === 'boolean' ? (val ? 'Sí' : 'No') : String(val)}</span>
                                </div>
                            ))}
                            <p className="text-[10px] text-gray-400 pt-2">Creado: {fmtDate(item.created_at)}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
