import { useState, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'

const tipoIcons = { nota: '📝', llamada: '📞', reunion: '🤝', email: '📧', tarea: '✅' };
const tipoLabels = { nota: 'Nota', llamada: 'Llamada', reunion: 'Reunión', email: 'Email', tarea: 'Tarea' };

const tableMap = { prospecto: 'prospectos', cerrado: 'cerrados', ticket: 'tickets', keyaccount: 'key_accounts' };

const tipoOptions = ['Ticket RC Express', 'Ticket Diag Org', 'Ticket ESG', 'Key Account Nivel 1', 'Key Account Nivel 2', 'Key Account Nivel 3', 'Gestión de Contenido'];

export default function EntityDetail({ entity, onClose, contactos, notas, user, onRefresh }) {
    const { type, item } = entity;
    const [activeSection, setActiveSection] = useState('ficha');
    const [formData, setFormData] = useState({ ...item });
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newNota, setNewNota] = useState({ tipo: 'nota', contenido: '' });
    const [newContacto, setNewContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '' });

    const entityNotas = useMemo(() =>
        notas.filter(n => n.entidad_tipo === type && n.entidad_id === item.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        [notas, type, item.id]
    );

    const entityContactos = useMemo(() =>
        contactos.filter(c => c.organizacion?.toLowerCase() === (item.organizacion || '').toLowerCase()),
        [contactos, item.organizacion]
    );

    const update = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        const table = tableMap[type];
        const { id, created_at, ...rest } = formData;
        const { error } = await supabase.from(table).update(rest).eq('id', id);
        if (error) { showToast('Error al guardar', 'error'); console.error(error); }
        else { showToast('Guardado ✓', 'success'); setDirty(false); onRefresh(); }
        setSaving(false);
    };

    const handleAddNota = async () => {
        if (!newNota.contenido.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('notas').insert({
            entidad_tipo: type, entidad_id: item.id, tipo: newNota.tipo,
            contenido: newNota.contenido.trim(), created_by_email: user?.email || 'anon'
        });
        if (error) showToast('Error', 'error');
        else { showToast('Nota agregada', 'success'); setNewNota({ tipo: 'nota', contenido: '' }); onRefresh(); }
        setSaving(false);
    };

    const handleAddContacto = async () => {
        if (!newContacto.nombre.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('contactos').insert({
            organizacion: formData.organizacion || '', ...newContacto, created_by_email: user?.email || 'anon'
        });
        if (error) showToast('Error', 'error');
        else { showToast('Contacto agregado', 'success'); setNewContacto({ nombre: '', cargo: '', email: '', telefono: '' }); onRefresh(); }
        setSaving(false);
    };

    const handleDeleteNota = async (id) => {
        if (!confirm('¿Eliminar esta nota?')) return;
        await supabase.from('notas').delete().eq('id', id);
        onRefresh();
    };

    const handleToggleTarea = async (nota) => {
        await supabase.from('notas').update({ completada: !nota.completada }).eq('id', nota.id);
        onRefresh();
    };

    const handleDeleteContacto = async (id) => {
        if (!confirm('¿Eliminar este contacto?')) return;
        await supabase.from('contactos').delete().eq('id', id);
        onRefresh();
    };

    const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

    const org = formData.organizacion || formData.ticket || 'Sin nombre';
    const info = (() => {
        switch (type) {
            case 'prospecto': return { badge: formData.estado, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
            case 'ticket': return { badge: formData.status || 'Activo', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
            case 'keyaccount': return { badge: formData.salud || 'Activo', color: formData.salud === 'Crítico' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800' };
            case 'cerrado': return { badge: formData.estado_final, color: formData.estado_final === 'Ganado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' };
            default: return { badge: '', color: '' };
        }
    })();

    const sections = [
        { id: 'ficha', label: '📄 Ficha' },
        { id: 'timeline', label: '📋 Timeline', count: entityNotas.length },
        { id: 'contactos', label: '👤 Contactos', count: entityContactos.length },
    ];

    // Field helper components
    const F = ({ label, children, span = 1 }) => (
        <div className={span === 2 ? 'sm:col-span-2' : ''}>
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{label}</label>
            {children}
        </div>
    );
    const inputCls = "w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-transparent";
    const Input = ({ field, type: t = 'text', ...props }) => <input type={t} value={formData[field] ?? ''} onChange={e => update(field, t === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} className={inputCls} {...props} />;
    const Select = ({ field, options }) => (
        <select value={formData[field] ?? ''} onChange={e => update(field, e.target.value)} className={inputCls}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );
    const TextArea = ({ field, rows = 3 }) => <textarea value={formData[field] ?? ''} onChange={e => update(field, e.target.value)} rows={rows} className={inputCls + ' resize-none'} />;

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
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            {dirty && <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>}
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                        </div>
                    </div>
                </div>

                {/* Section tabs */}
                <div className="flex border-b dark:border-gray-700 px-5">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition ${activeSection === s.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {s.label} {s.count !== undefined ? `(${s.count})` : ''}
                        </button>
                    ))}
                </div>

                <div className="p-5 max-h-[65vh] overflow-y-auto">
                    {/* FICHA - Unified editable form */}
                    {activeSection === 'ficha' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Common fields */}
                            <F label="Organización"><Input field="organizacion" /></F>
                            <F label="Contacto"><Input field="contacto" /></F>
                            <F label="Tipo de Servicio">
                                <Select field="tipo" options={tipoOptions} />
                            </F>

                            {/* Prospecto fields */}
                            {type === 'prospecto' && <>
                                <F label="Estado">
                                    <Select field="estado" options={['Contactado', 'Reunión agendada', 'Propuesta enviada', 'Negociación']} />
                                </F>
                                <F label="Valor (UF)"><Input field="valor" type="number" step="0.01" /></F>
                                <F label="Probabilidad (%)"><Input field="probabilidad" type="number" min="0" max="100" /></F>
                                <F label="Fecha Límite"><Input field="fecha_limite" type="date" /></F>
                                <F label="Próximo Paso"><Input field="proximo_paso" /></F>
                                <F label="Notas" span={2}><TextArea field="notas" /></F>
                            </>}

                            {/* Ticket fields */}
                            {type === 'ticket' && <>
                                <F label="Nombre del Ticket"><Input field="ticket" /></F>
                                <F label="Valor">
                                    <div className="flex gap-2">
                                        <Input field="valor_monto" type="number" step="0.01" />
                                        <select value={formData.valor_moneda ?? 'UF'} onChange={e => update('valor_moneda', e.target.value)} className={inputCls + ' w-20 flex-shrink-0'}>
                                            <option value="UF">UF</option>
                                            <option value="CLP">CLP</option>
                                        </select>
                                    </div>
                                </F>
                                <F label="Fase Actual">
                                    <Select field="fase_actual" options={['Kick-off', 'Diagnóstico', 'Desarrollo', 'Entrega', 'Cierre']} />
                                </F>
                                <F label="Avance (%)"><Input field="porcentaje_avance" type="number" min="0" max="100" /></F>
                                <F label="Fecha Inicio"><Input field="fecha_inicio" type="date" /></F>
                                <F label="Fecha Entrega"><Input field="fecha_entrega" type="date" /></F>
                                <F label="Responsable"><Input field="responsable" /></F>
                            </>}

                            {/* Key Account fields */}
                            {type === 'keyaccount' && <>
                                <F label="Servicio"><Input field="servicio" /></F>
                                <F label="UF/mes"><Input field="uf_mes" type="number" step="0.01" /></F>
                                <F label="Salud">
                                    <Select field="salud" options={['Activo', 'Riesgo', 'Crítico']} />
                                </F>
                                <F label="Frecuencia Facturación">
                                    <Select field="frecuencia_facturacion" options={['Mensual', 'Trimestral', 'Semestral', 'Anual']} />
                                </F>
                                <F label="Inicio Contrato"><Input field="fecha_inicio_contrato" type="date" /></F>
                                <F label="Fin Contrato"><Input field="fecha_fin_contrato" type="date" /></F>
                                <F label="Renovación Automática">
                                    <select value={formData.renovacion_automatica ? 'true' : 'false'} onChange={e => update('renovacion_automatica', e.target.value === 'true')} className={inputCls}>
                                        <option value="true">Sí</option>
                                        <option value="false">No</option>
                                    </select>
                                </F>
                                <F label="Responsable"><Input field="responsable" /></F>
                            </>}

                            {/* Cerrado fields */}
                            {type === 'cerrado' && <>
                                <F label="Estado Final">
                                    <Select field="estado_final" options={['Ganado', 'Perdido']} />
                                </F>
                                <F label="Valor (UF)"><Input field="valor" type="number" step="0.01" /></F>
                                <F label="Fecha Inicio"><Input field="fecha_inicio" type="date" /></F>
                                <F label="Fecha Cierre"><Input field="fecha_cierre" type="date" /></F>
                                {formData.estado_final === 'Perdido' && (
                                    <F label="Razón de Pérdida">
                                        <Select field="razon_perdida" options={['Presupuesto', 'Timing', 'Competencia', 'No respondió', 'No calificado', 'Otro']} />
                                    </F>
                                )}
                                <F label="Motivo de Cierre"><Input field="motivo_cierre" /></F>
                                <F label="Notas" span={2}><TextArea field="notas" /></F>
                            </>}

                            {/* Save button at bottom */}
                            {dirty && (
                                <div className="sm:col-span-2 flex justify-end pt-2">
                                    <button onClick={handleSave} disabled={saving} className="px-6 py-2 color-naranja text-white rounded-lg text-sm font-medium disabled:opacity-50">
                                        {saving ? 'Guardando...' : 'Guardar cambios'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TIMELINE */}
                    {activeSection === 'timeline' && (
                        <div className="space-y-4">
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex gap-1.5 mb-2 flex-wrap">
                                    {Object.entries(tipoLabels).map(([k, v]) => (
                                        <button key={k} onClick={() => setNewNota({...newNota, tipo: k})}
                                            className={`px-2 py-1 text-[10px] rounded-lg transition ${newNota.tipo === k ? 'bg-naranja text-white' : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 border dark:border-gray-500'}`}>
                                            {tipoIcons[k]} {v}
                                        </button>
                                    ))}
                                </div>
                                <textarea value={newNota.contenido} onChange={e => setNewNota({...newNota, contenido: e.target.value})}
                                    placeholder={`Agregar ${tipoLabels[newNota.tipo].toLowerCase()}...`} rows={2}
                                    className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 resize-none" />
                                <div className="flex justify-end mt-2">
                                    <button onClick={handleAddNota} disabled={saving || !newNota.contenido.trim()} className="px-4 py-1.5 color-naranja text-white text-xs rounded-lg font-medium disabled:opacity-50">Agregar</button>
                                </div>
                            </div>

                            {entityNotas.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin actividades registradas</p>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>
                                    {entityNotas.map(n => (
                                        <div key={n.id} className="relative pl-10 pb-3 group">
                                            <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-white dark:bg-gray-800 border-2 border-naranja"></div>
                                            <div className="bg-white dark:bg-gray-700 rounded-lg p-3 border dark:border-gray-600 shadow-sm">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs">{tipoIcons[n.tipo] || '📝'}</span>
                                                        <span className="text-[10px] font-medium text-gray-500 uppercase">{tipoLabels[n.tipo] || n.tipo}</span>
                                                        {n.tipo === 'tarea' && (
                                                            <button onClick={() => handleToggleTarea(n)} className={`text-[10px] px-1.5 py-0.5 rounded ${n.completada ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                                {n.completada ? '✓ Hecha' : 'Pendiente'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-gray-400">{fmtDateTime(n.created_at)}</span>
                                                        <button onClick={() => handleDeleteNota(n.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs">✕</button>
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
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Nuevo contacto en {formData.organizacion}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={newContacto.nombre} onChange={e => setNewContacto({...newContacto, nombre: e.target.value})} placeholder="Nombre *" className={inputCls} />
                                    <input value={newContacto.cargo} onChange={e => setNewContacto({...newContacto, cargo: e.target.value})} placeholder="Cargo" className={inputCls} />
                                    <input value={newContacto.email} onChange={e => setNewContacto({...newContacto, email: e.target.value})} placeholder="Email" type="email" className={inputCls} />
                                    <input value={newContacto.telefono} onChange={e => setNewContacto({...newContacto, telefono: e.target.value})} placeholder="Teléfono" className={inputCls} />
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
                                                {c.cargo && <span className="text-xs text-gray-500 ml-2">{c.cargo}</span>}
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {c.email && <span className="text-xs text-azul">{c.email}</span>}
                                                    {c.telefono && <span className="text-xs text-gray-500">{c.telefono}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDeleteContacto(c.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
