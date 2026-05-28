import { useState } from 'react'
import InputField from '../shared/InputField'
import SelectField from '../shared/SelectField'
import TextAreaField from '../shared/TextAreaField'
import useEscapeKey from '../../hooks/useEscapeKey'
import type { Ticket, KeyAccount } from '../../types'

type ContaType = 'emitida' | 'recibida' | 'boleta' | 'sueldo' | 'caja'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormState = Record<string, any>

interface ContaModalProps {
    type: ContaType
    item: FormState | null
    ufActual: number
    tickets?: Ticket[]
    keyAccounts?: KeyAccount[]
    onSave: (form: FormState) => Promise<void>
    onClose: () => void
}

export default function ContaModal({ type, item, ufActual, onSave, onClose }: ContaModalProps) {
    useEscapeKey(onClose)

    const getDefault = (): FormState => {
        if (type === 'emitida') return { numero_factura: '', cliente: '', fecha_emision: new Date().toISOString().split('T')[0], monto_uf: '', monto_clp: '', uf_dia: ufActual, descripcion: '', estado: 'Pendiente', fecha_pago: null, ticket_id: null, key_account_id: null, moneda_principal: 'UF' }
        if (type === 'recibida') return { numero_factura: '', proveedor: '', categoria: 'Servicios', fecha_emision: new Date().toISOString().split('T')[0], monto_uf: '', monto_clp: '', uf_dia: ufActual, descripcion: '', estado: 'Pendiente', fecha_pago: null, moneda_principal: 'UF' }
        if (type === 'boleta') return { fecha: new Date().toISOString().split('T')[0], prestador: '', rut: '', monto_bruto_uf: '', monto_bruto_clp: '', uf_dia: ufActual, porcentaje_retencion: 15.25, monto_retencion_uf: '', monto_retencion_clp: '', monto_liquido_uf: '', monto_liquido_clp: '', descripcion: '', mes_servicio: '', proyecto: '', moneda_principal: 'UF' }
        if (type === 'sueldo') return { fecha: new Date().toISOString().split('T')[0], socio: 'Jere', monto_uf: '', monto_clp: '', uf_dia: ufActual, concepto: '', mes_servicio: '', moneda_principal: 'UF' }
        // caja
        return { fecha: new Date().toISOString().split('T')[0], concepto: '', monto_clp: '', categoria: 'Otros', responsable: '', comprobante: '' }
    }

    const [form, setForm] = useState<FormState>(item || getDefault())
    const [monedaPrincipal, setMonedaPrincipal] = useState<string>(form.moneda_principal || 'UF')
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (saving) return
        setSaving(true)
        try { await onSave(form) } finally { setSaving(false) }
    }

    // Auto-calcular UF o CLP para facturas
    const handleMontoChange = (field: string, value: string) => {
        const num = parseFloat(value) || 0
        if (field === 'monto_uf') {
            setForm({ ...form, monto_uf: value, monto_clp: Math.round(num * (form.uf_dia || ufActual)) })
        } else if (field === 'monto_clp') {
            setForm({ ...form, monto_clp: value, monto_uf: (num / (form.uf_dia || ufActual)).toFixed(2) })
        }
    }

    // Recalcular retención y líquido a partir de bruto + porcentaje
    const recalcularBoleta = (brutoUF: string | number, porcentaje: string | number, ufDia: number) => {
        const bruto = parseFloat(String(brutoUF)) || 0
        const pct = parseFloat(String(porcentaje)) || 0
        const uf = ufDia || ufActual
        const retencionUF = (bruto * pct / 100).toFixed(2)
        const liquidoUF = (bruto - parseFloat(retencionUF)).toFixed(2)
        return {
            monto_retencion_uf: retencionUF,
            monto_retencion_clp: Math.round(parseFloat(retencionUF) * uf),
            monto_liquido_uf: liquidoUF,
            monto_liquido_clp: Math.round(parseFloat(liquidoUF) * uf)
        }
    }

    const handleBoletaMontoChange = (field: string, value: string) => {
        const num = parseFloat(value) || 0
        const porcentaje = parseFloat(form.porcentaje_retencion) || 0
        if (field === 'monto_bruto_uf') {
            setForm({ ...form, monto_bruto_uf: value, monto_bruto_clp: Math.round(num * (form.uf_dia || ufActual)), ...recalcularBoleta(value, porcentaje, form.uf_dia) })
        } else if (field === 'monto_bruto_clp') {
            const brutoUF = (num / (form.uf_dia || ufActual)).toFixed(2)
            setForm({ ...form, monto_bruto_clp: value, monto_bruto_uf: brutoUF, ...recalcularBoleta(brutoUF, porcentaje, form.uf_dia) })
        }
    }

    const handlePorcentajeChange = (value: string) => {
        setForm({ ...form, porcentaje_retencion: value, ...recalcularBoleta(form.monto_bruto_uf, value, form.uf_dia) })
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {item ? 'Editar' : 'Nueva'} {
                            type === 'emitida' ? 'Factura Emitida' :
                            type === 'recibida' ? 'Factura Recibida' :
                            type === 'boleta' ? 'Boleta de Honorarios' :
                            type === 'sueldo' ? 'Sueldo Socio' :
                            'Gasto Caja Chica'
                        }
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl transition">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {type === 'emitida' && (<>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="N° Factura" required value={form.numero_factura} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, numero_factura: e.target.value })} />
                            <InputField label="Cliente" required value={form.cliente} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, cliente: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Fecha Emisión" type="date" required value={form.fecha_emision} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fecha_emision: e.target.value })} />
                            <SelectField label="Estado" value={form.estado} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, estado: e.target.value })} options={['Pendiente', 'Pagada', 'Vencida']} />
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <label className="block text-xs font-medium text-gray-700 mb-2">💱 Moneda de ingreso</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setMonedaPrincipal('UF')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'UF' ? 'bg-verde text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>UF</button>
                                <button type="button" onClick={() => setMonedaPrincipal('CLP')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'CLP' ? 'bg-verde text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>$ CLP</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {monedaPrincipal === 'UF' ? (<>
                                <InputField label="Monto UF" type="number" step="0.01" required value={form.monto_uf} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMontoChange('monto_uf', e.target.value)} />
                                <InputField label="Equiv. CLP" type="number" disabled value={form.monto_clp} className="bg-gray-50" />
                                <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, uf_dia: parseFloat(e.target.value) }); handleMontoChange('monto_uf', form.monto_uf) }} />
                            </>) : (<>
                                <InputField label="Monto CLP" type="number" required value={form.monto_clp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMontoChange('monto_clp', e.target.value)} />
                                <InputField label="Equiv. UF" type="number" step="0.01" disabled value={form.monto_uf} className="bg-gray-50" />
                                <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, uf_dia: parseFloat(e.target.value) }); handleMontoChange('monto_clp', form.monto_clp) }} />
                            </>)}
                        </div>
                        <TextAreaField label="Descripción" value={form.descripcion || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, descripcion: e.target.value })} />
                        {form.estado === 'Pagada' && (
                            <InputField label="Fecha Pago" type="date" value={form.fecha_pago || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fecha_pago: e.target.value })} />
                        )}
                    </>)}

                    {type === 'recibida' && (<>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Proveedor" required value={form.proveedor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, proveedor: e.target.value })} />
                            <SelectField label="Categoría" required value={form.categoria} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, categoria: e.target.value })} options={['Honorarios', 'Servicios', 'Oficina', 'Marketing', 'Tecnología', 'Sueldos', 'Otros']} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Fecha Emisión" type="date" required value={form.fecha_emision} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fecha_emision: e.target.value })} />
                            <SelectField label="Estado" value={form.estado} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, estado: e.target.value })} options={['Pendiente', 'Pagada']} />
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <label className="block text-xs font-medium text-gray-700 mb-2">💱 Moneda de ingreso</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setMonedaPrincipal('UF')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'UF' ? 'bg-verde text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>UF</button>
                                <button type="button" onClick={() => setMonedaPrincipal('CLP')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'CLP' ? 'bg-verde text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>$ CLP</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {monedaPrincipal === 'UF' ? (<>
                                <InputField label="Monto UF" type="number" step="0.01" required value={form.monto_uf} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMontoChange('monto_uf', e.target.value)} />
                                <InputField label="Equiv. CLP" type="number" disabled value={form.monto_clp} className="bg-gray-50" />
                                <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, uf_dia: parseFloat(e.target.value) }); handleMontoChange('monto_uf', form.monto_uf) }} />
                            </>) : (<>
                                <InputField label="Monto CLP" type="number" required value={form.monto_clp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMontoChange('monto_clp', e.target.value)} />
                                <InputField label="Equiv. UF" type="number" step="0.01" disabled value={form.monto_uf} className="bg-gray-50" />
                                <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, uf_dia: parseFloat(e.target.value) }); handleMontoChange('monto_clp', form.monto_clp) }} />
                            </>)}
                        </div>
                        <TextAreaField label="Descripción" value={form.descripcion || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, descripcion: e.target.value })} />
                    </>)}

                    {type === 'sueldo' && (<>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Socio</label>
                                <input type="text" value={form.socio || ''} onChange={(e) => setForm({ ...form, socio: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Fecha</label>
                                <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full border rounded p-2" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Mes de Servicio</label>
                            <input type="text" value={form.mes_servicio || ''} onChange={(e) => setForm({ ...form, mes_servicio: e.target.value })} className="w-full border rounded p-2" placeholder="Enero 2026" />
                        </div>
                        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded">
                            <span className="text-sm font-medium">Moneda principal:</span>
                            <button type="button" onClick={() => setMonedaPrincipal('UF')} className={`px-3 py-1 rounded text-sm ${monedaPrincipal === 'UF' ? 'bg-verde text-white' : 'bg-gray-200'}`}>UF</button>
                            <button type="button" onClick={() => setMonedaPrincipal('CLP')} className={`px-3 py-1 rounded text-sm ${monedaPrincipal === 'CLP' ? 'bg-verde text-white' : 'bg-gray-200'}`}>CLP</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Monto {monedaPrincipal === 'UF' ? 'UF' : 'CLP'}</label>
                                <input type="number" step="0.01" value={monedaPrincipal === 'UF' ? (form.monto_uf || '') : (form.monto_clp || '')} onChange={(e) => handleMontoChange(monedaPrincipal === 'UF' ? 'monto_uf' : 'monto_clp', e.target.value)} className="w-full border rounded p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Equivalente {monedaPrincipal === 'UF' ? 'CLP' : 'UF'}</label>
                                <input type="number" step="0.01" value={monedaPrincipal === 'UF' ? (form.monto_clp || '') : (form.monto_uf || '')} disabled className="w-full border rounded p-2 bg-gray-100" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">UF del día</label>
                                <input type="number" step="0.01" value={form.uf_dia} onChange={(e) => { const nuevoUF = parseFloat(e.target.value) || ufActual; setForm({ ...form, uf_dia: nuevoUF }) }} className="w-full border rounded p-2" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Concepto</label>
                            <input type="text" value={form.concepto || ''} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className="w-full border rounded p-2" placeholder="Sueldo mensual" />
                        </div>
                    </>)}

                    {type === 'caja' && (<>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Fecha" type="date" required value={form.fecha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fecha: e.target.value })} />
                            <InputField label="Monto CLP" type="number" required value={form.monto_clp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, monto_clp: e.target.value })} />
                        </div>
                        <InputField label="Concepto" required value={form.concepto} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, concepto: e.target.value })} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SelectField label="Categoría" value={form.categoria} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, categoria: e.target.value })} options={['Transporte', 'Alimentación', 'Materiales', 'Otros']} />
                            <InputField label="Responsable" value={form.responsable || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, responsable: e.target.value })} />
                        </div>
                        <InputField label="Comprobante (opcional)" value={form.comprobante || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, comprobante: e.target.value })} />
                    </>)}

                    {type === 'boleta' && (<>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Prestador" required value={form.prestador} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, prestador: e.target.value })} placeholder="Seba, Max, Patxi..." />
                            <InputField label="Mes Servicio" required value={form.mes_servicio} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, mes_servicio: e.target.value })} placeholder="Enero 2026" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField label="Fecha" type="date" required value={form.fecha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fecha: e.target.value })} />
                            <InputField label="RUT (opcional)" value={form.rut || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" />
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                            <h4 className="font-bold text-sm text-blue-900">💰 Cálculo de Honorarios</h4>
                            <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                                <label className="block text-xs font-medium text-blue-800 mb-2">💱 Moneda de ingreso</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setMonedaPrincipal('UF')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'UF' ? 'bg-blue-600 text-white' : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'}`}>UF</button>
                                    <button type="button" onClick={() => setMonedaPrincipal('CLP')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${monedaPrincipal === 'CLP' ? 'bg-blue-600 text-white' : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'}`}>$ CLP</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {monedaPrincipal === 'UF' ? (<>
                                    <InputField label="Monto Bruto UF" type="number" step="0.01" required value={form.monto_bruto_uf} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBoletaMontoChange('monto_bruto_uf', e.target.value)} />
                                    <InputField label="Equiv. CLP" type="number" disabled value={form.monto_bruto_clp} className="bg-gray-50" />
                                    <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, uf_dia: parseFloat(e.target.value) })} />
                                </>) : (<>
                                    <InputField label="Monto Bruto CLP" type="number" required value={form.monto_bruto_clp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleBoletaMontoChange('monto_bruto_clp', e.target.value)} />
                                    <InputField label="Equiv. UF" type="number" step="0.01" disabled value={form.monto_bruto_uf} className="bg-gray-50" />
                                    <InputField label="UF del día" type="number" value={form.uf_dia} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, uf_dia: parseFloat(e.target.value) })} />
                                </>)}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-blue-800 mb-1">% Retención</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { label: '13.75%', value: '13.75', año: '2024' },
                                        { label: '14.50%', value: '14.50', año: '2025' },
                                        { label: '15.25%', value: '15.25', año: '2026' },
                                        { label: '16.00%', value: '16.00', año: '2027' },
                                        { label: '0%', value: '0', año: 'Sin ret.' }
                                    ].map(opt => (
                                        <button type="button" key={opt.value} onClick={() => handlePorcentajeChange(opt.value)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${parseFloat(form.porcentaje_retencion) === parseFloat(opt.value) ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'}`}>
                                            <div>{opt.label}</div>
                                            <div className="text-xs opacity-60">{opt.año}</div>
                                        </button>
                                    ))}
                                    <input type="number" step="0.25" min="0" max="100" value={form.porcentaje_retencion} onChange={(e) => handlePorcentajeChange(e.target.value)} className="w-20 px-2 py-1.5 border border-blue-200 rounded-lg text-xs text-center" placeholder="%" />
                                </div>
                            </div>
                            <div className="bg-white dark:bg-gray-700 rounded p-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Retención ({form.porcentaje_retencion}%):</span>
                                    <span className="font-medium text-naranja">-{form.monto_retencion_uf} UF (${Math.round(form.monto_retencion_clp || 0).toLocaleString('es-CL')})</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t font-bold">
                                    <span>LÍQUIDO A PAGAR:</span>
                                    <span className="text-verde">{form.monto_liquido_uf} UF (${Math.round(form.monto_liquido_clp || 0).toLocaleString('es-CL')})</span>
                                </div>
                            </div>
                            <div className="text-xs text-blue-700">
                                ℹ️ La retención de {form.monto_retencion_uf} UF debe ser pagada al SII como parte de tus impuestos
                            </div>
                        </div>
                        <TextAreaField label="Descripción del servicio" value={form.descripcion || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, descripcion: e.target.value })} />
                        <InputField label="Proyecto (opcional)" value={form.proyecto || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, proyecto: e.target.value })} placeholder="CChC, Club34, etc." />
                    </>)}

                    <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
                        <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 color-naranja text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Guardando…' : 'Guardar'}</button>
                        <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    )
}
