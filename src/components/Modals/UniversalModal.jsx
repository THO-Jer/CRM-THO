import { useState } from 'react'
import InputField from '../shared/InputField'
import SelectField from '../shared/SelectField'
import TextAreaField from '../shared/TextAreaField'

export default function UniversalModal({ type, item, onSave, onClose }) {
    const getDefault = (type) => {
        if (type === 'prospecto') return { organizacion: '', contacto: '', tipo: 'Ticket RC Express', estado: 'Contactado', valor: '', probabilidad: 10, proximo_paso: '', fecha_limite: '', notas: '' };
        if (type === 'cerrado') return { organizacion: '', contacto: '', tipo: 'Ticket RC Express', estado_final: 'Ganado', fecha_cierre: new Date().toISOString().split('T')[0], fecha_inicio: '', fecha_termino: '', valor: '', razon_perdida: '', motivo_cierre: '', notas: '' };
        if (type === 'ticket') return { organizacion: '', ticket: 'Ticket RC Express', fecha_inicio: new Date().toISOString().split('T')[0], fecha_entrega: '', fase_actual: 'Kick-off', porcentaje_avance: 0, responsable: '', valor_monto: 0, valor_moneda: 'UF' };
        if (type === 'keyaccount') return { organizacion: '', servicio: 'RC Nivel 3', uf_mes: '', inicio_contrato: '', fin_contrato: '', renovacion: 'Por definir', salud: 'Buena' };
    };
    
    const [formData, setFormData] = useState(item || getDefault(type));
    const titles = { prospecto: 'Prospecto', cerrado: 'Cerrado', ticket: 'Ticket', keyaccount: 'Key Account' };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-5 sm:p-6">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{item ? 'Editar' : 'Nuevo'} {titles[type]}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl transition">✕</button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4">
                        {type === 'prospecto' && (<>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Organización" required value={formData.organizacion} onChange={(e) => setFormData({...formData, organizacion: e.target.value})} />
                                <InputField label="Contacto" required value={formData.contacto} onChange={(e) => setFormData({...formData, contacto: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectField label="Tipo" required value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})} options={['Ticket RC Express', 'Ticket Diag Org', 'Ticket ESG', 'Key Account Nivel 1', 'Key Account Nivel 2', 'Key Account Nivel 3', 'Gestión de Contenido']} />
                                <SelectField label="Estado" required value={formData.estado} onChange={(e) => setFormData({...formData, estado: e.target.value})} options={['Lead nuevo', 'Contactado', 'Reunión agendada', 'Propuesta enviada', 'Negociación']} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Valor (UF)" type="number" step="0.01" required value={formData.valor} onChange={(e) => setFormData({...formData, valor: parseFloat(e.target.value) || 0})} />
                                <InputField label="Fecha Límite" type="date" required value={formData.fecha_limite} onChange={(e) => setFormData({...formData, fecha_limite: e.target.value})} />
                            </div>
                            <InputField label="Próximo Paso" required value={formData.proximo_paso} onChange={(e) => setFormData({...formData, proximo_paso: e.target.value})} />
                            <TextAreaField label="Notas" value={formData.notas || ''} onChange={(e) => setFormData({...formData, notas: e.target.value})} />
                        </>)}
                        {type === 'cerrado' && (<>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Organización" required value={formData.organizacion} onChange={(e) => setFormData({...formData, organizacion: e.target.value})} />
                                <InputField label="Contacto" value={formData.contacto || ''} onChange={(e) => setFormData({...formData, contacto: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectField label="Tipo" required value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})} options={['Ticket RC Express', 'Ticket Diag Org', 'Ticket ESG', 'Key Account Nivel 1', 'Key Account Nivel 2', 'Key Account Nivel 3', 'Gestión de Contenido']} />
                                <SelectField label="Estado Final" required value={formData.estado_final} onChange={(e) => setFormData({...formData, estado_final: e.target.value})} options={['Ganado', 'Perdido']} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <InputField label="Valor (UF)" type="number" step="0.01" required value={formData.valor} onChange={(e) => setFormData({...formData, valor: parseFloat(e.target.value) || 0})} />
                                <InputField label="Fecha Inicio" type="date" value={formData.fecha_inicio || ''} onChange={(e) => setFormData({...formData, fecha_inicio: e.target.value})} />
                                <InputField label="Fecha Cierre" type="date" required value={formData.fecha_cierre} onChange={(e) => setFormData({...formData, fecha_cierre: e.target.value})} />
                            </div>
                            {formData.estado_final === 'Perdido' && <SelectField label="Razón de Pérdida" value={formData.razon_perdida || ''} onChange={(e) => setFormData({...formData, razon_perdida: e.target.value})} options={['Presupuesto', 'Timing', 'Competencia', 'No respondió', 'No calificado', 'Otro']} />}
                            <InputField label="Motivo de Cierre / Observaciones" value={formData.motivo_cierre || ''} onChange={(e) => setFormData({...formData, motivo_cierre: e.target.value})} />
                            <TextAreaField label="Notas" value={formData.notas || ''} onChange={(e) => setFormData({...formData, notas: e.target.value})} />
                        </>)}
                        {type === 'ticket' && (<>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Organización" required value={formData.organizacion} onChange={(e) => setFormData({...formData, organizacion: e.target.value})} />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ticket *</label>
                                    <input list="ticket-sugerencias" required value={formData.ticket} onChange={(e) => setFormData({...formData, ticket: e.target.value})} className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-naranja" placeholder="Nombre del ticket..." />
                                    <datalist id="ticket-sugerencias"><option value="Ticket RC Express" /><option value="Ticket Diag Org" /><option value="Ticket ESG" /></datalist>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Fecha Inicio" type="date" required value={formData.fecha_inicio} onChange={(e) => setFormData({...formData, fecha_inicio: e.target.value})} />
                                <InputField label="Fecha Entrega" type="date" required value={formData.fecha_entrega} onChange={(e) => setFormData({...formData, fecha_entrega: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <InputField label="Valor" type="number" step="0.01" required value={formData.valor_monto || 0} onChange={(e) => setFormData({...formData, valor_monto: parseFloat(e.target.value) || 0})} />
                                <SelectField label="Moneda" required value={formData.valor_moneda || 'UF'} onChange={(e) => setFormData({...formData, valor_moneda: e.target.value})} options={['UF', 'CLP']} />
                                <InputField label="% Avance" type="number" min="0" max="100" required value={formData.porcentaje_avance} onChange={(e) => setFormData({...formData, porcentaje_avance: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectField label="Fase" required value={formData.fase_actual} onChange={(e) => setFormData({...formData, fase_actual: e.target.value})} options={['Kick-off', 'Levantamiento', 'Análisis', 'Entrega', 'Cerrado']} />
                                <InputField label="Responsable" value={formData.responsable || ''} onChange={(e) => setFormData({...formData, responsable: e.target.value})} />
                            </div>
                        </>)}
                        {type === 'keyaccount' && (<>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="Organización" required value={formData.organizacion} onChange={(e) => setFormData({...formData, organizacion: e.target.value})} />
                                <InputField label="Servicio" required value={formData.servicio} onChange={(e) => setFormData({...formData, servicio: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <InputField label="UF/mes" type="number" step="0.01" required value={formData.uf_mes} onChange={(e) => setFormData({...formData, uf_mes: parseFloat(e.target.value) || 0})} />
                                <InputField label="Inicio" type="date" required value={formData.inicio_contrato} onChange={(e) => setFormData({...formData, inicio_contrato: e.target.value})} />
                                <InputField label="Fin" type="date" value={formData.fin_contrato || ''} onChange={(e) => setFormData({...formData, fin_contrato: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectField label="Renovación" value={formData.renovacion} onChange={(e) => setFormData({...formData, renovacion: e.target.value})} options={['Confirmada', 'En conversación', 'No renovará', 'Por definir']} />
                                <SelectField label="Salud" value={formData.salud} onChange={(e) => setFormData({...formData, salud: e.target.value})} options={['Excelente', 'Buena', 'Riesgo', 'Crítico']} />
                            </div>
                        </>)}
                        <div className="flex space-x-3 pt-4 border-t dark:border-gray-700">
                            <button type="submit" className="flex-1 px-4 py-2.5 color-naranja text-white rounded-lg font-medium hover:opacity-90 transition">Guardar</button>
                            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
