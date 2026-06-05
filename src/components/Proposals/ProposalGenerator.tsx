import { useState } from 'react'
import { jsPDF } from 'jspdf'
import type { Prospecto } from '../../types'

// Plazos sugeridos por tipo — la descripción y entregables son siempre libres
const plazoPorTipo: Record<string, string> = {
    'Ticket RC Express':   '2-3 semanas',
    'Ticket Diag Org':     '4-6 semanas',
    'Ticket ESG':          '6-8 semanas',
    'Key Account Nivel 1': 'Contrato anual renovable',
    'Key Account Nivel 2': 'Contrato anual renovable',
    'Key Account Nivel 3': 'Contrato anual renovable',
    'Gestión de Contenido':'Contrato mensual/trimestral',
}

const tiposServicio = Object.keys(plazoPorTipo)

interface ProposalForm {
    cliente: string
    contacto: string
    tipo: string
    foco: string
    descripcion: string
    entregables: string
    plazo: string
    valor_uf: string
    condiciones_pago: string
    validez: string
    fecha: string
    nota_adicional: string
}

interface ProposalGeneratorProps {
    prospecto: Prospecto | null
    onClose: () => void
    ufActual: number
}

export default function ProposalGenerator({ prospecto, onClose, ufActual }: ProposalGeneratorProps) {
    const tipo0 = prospecto?.tipo || tiposServicio[0]

    const [form, setForm] = useState<ProposalForm>({
        cliente:          prospecto?.organizacion || '',
        contacto:         prospecto?.contacto || '',
        tipo:             tipo0,
        foco:             '',
        descripcion:      '',
        entregables:      '',
        plazo:            plazoPorTipo[tipo0] || '',
        valor_uf:         String(prospecto?.valor || ''),
        condiciones_pago: 'Orden de compra',
        validez:          '30 días',
        fecha:            new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
        nota_adicional:   '',
    })

    const set = (key: keyof ProposalForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value }))

    const updateTipo = (tipo: string) =>
        setForm(prev => ({ ...prev, tipo, plazo: plazoPorTipo[tipo] || prev.plazo }))

    const generatePDF = () => {
        const doc = new jsPDF({ unit: 'mm', format: 'letter' })
        const W = doc.internal.pageSize.getWidth()   // 215.9
        const H = doc.internal.pageSize.getHeight()  // 279.4
        const ML = 20, MR = 20
        const CW = W - ML - MR
        let y = 0

        type RGB = [number, number, number]
        const naranja: RGB  = [235, 95, 50]
        const oscuro: RGB   = [25, 25, 35]
        const gris: RGB     = [100, 100, 110]
        const grisCla: RGB  = [195, 195, 200]
        const fondo: RGB    = [250, 249, 248]
        const blanco: RGB   = [255, 255, 255]

        const rgb  = (c: RGB) => { doc.setTextColor(c[0], c[1], c[2]) }
        const fill = (c: RGB) => { doc.setFillColor(c[0], c[1], c[2]) }
        const draw = (c: RGB) => { doc.setDrawColor(c[0], c[1], c[2]) }
        const ft   = (s: number, w: 'normal'|'bold'|'italic' = 'normal') => { doc.setFontSize(s); doc.setFont('helvetica', w) }

        const txt = (text: string, x: number, yp: number, opts: { size?: number; bold?: boolean; italic?: boolean; color?: RGB; align?: 'left'|'center'|'right'; maxW?: number } = {}) => {
            const { size = 9, bold = false, italic = false, color = oscuro, align = 'left', maxW = CW } = opts
            ft(size, bold ? 'bold' : italic ? 'italic' : 'normal'); rgb(color)
            const lines = doc.splitTextToSize(text, maxW)
            doc.text(lines, x, yp, { align })
            return (lines.length - 1) * size * 0.38
        }

        const ln = (yp: number, c: RGB = grisCla, w = 0.25) => {
            draw(c); doc.setLineWidth(w); doc.line(ML, yp, W - MR, yp)
        }

        const refNum = `COT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`
        const valorNum  = parseFloat(form.valor_uf) || 0
        const valorCLP  = Math.round(valorNum * (ufActual || 38000))
        const isRecurr  = form.tipo.startsWith('Key Account') || form.tipo === 'Gestión de Contenido'

        // ── BANDA SUPERIOR ──────────────────────────────────────────────
        fill(oscuro); doc.rect(0, 0, W, 14, 'F')
        fill(naranja); doc.rect(0, 12, W, 2, 'F')

        ft(11, 'bold'); rgb(blanco)
        doc.text('THE HUMAN ORG', ML, 9)
        ft(7); rgb(grisCla)
        doc.text('Consultoría · Desarrollo Organizacional y Comunitario', ML + 46, 9)
        doc.text(form.fecha, W - MR, 9, { align: 'right' })

        // ── ENCABEZADO ──────────────────────────────────────────────────
        y = 24
        txt('PROPUESTA DE SERVICIO', ML, y, { size: 7, color: naranja, bold: true })
        txt(refNum, W - MR, y, { size: 7, color: gris, align: 'right' })

        y += 7
        txt(form.cliente || 'Cliente', ML, y, { size: 16, bold: true })
        if (form.contacto) {
            y += 7
            txt(`Attn. ${form.contacto}`, ML, y, { size: 8.5, color: gris })
        }

        // ── LÍNEA DIVISORA ───────────────────────────────────────────────
        y += 7; ln(y, naranja, 0.4); y += 6

        // ── SERVICIO ─────────────────────────────────────────────────────
        txt('SERVICIO', ML, y, { size: 6.5, color: naranja, bold: true })
        y += 5
        txt(form.tipo, ML, y, { size: 12, bold: true })
        if (form.foco.trim()) {
            y += 6
            txt(form.foco, ML, y, { size: 9.5, italic: true, color: gris })
        }

        if (form.descripcion.trim()) {
            y += 7
            const dLines = doc.splitTextToSize(form.descripcion, CW)
            ft(8.5); rgb(oscuro)
            doc.text(dLines, ML, y)
            y += (dLines.length - 1) * 3.6 + 5
        } else {
            y += 5
        }

        // ── ENTREGABLES ───────────────────────────────────────────────────
        const items = form.entregables.split('\n').map(s => s.trim()).filter(Boolean)
        if (items.length > 0) {
            ln(y, grisCla); y += 5
            txt('ENTREGABLES', ML, y, { size: 6.5, color: naranja, bold: true })
            y += 5

            // Dos columnas si hay ≥4 ítems
            if (items.length >= 4) {
                const half = Math.ceil(items.length / 2)
                const colW = CW / 2 - 4
                items.forEach((item, i) => {
                    const col = i < half ? 0 : 1
                    const row = i < half ? i : i - half
                    const xBase = ML + col * (CW / 2 + 2)
                    const yRow = y + row * 6
                    fill(naranja); doc.circle(xBase + 2, yRow - 1.2, 1.2, 'F')
                    txt(item, xBase + 6, yRow, { size: 8, maxW: colW })
                })
                y += Math.ceil(items.length / 2) * 6 + 2
            } else {
                items.forEach(item => {
                    fill(naranja); doc.circle(ML + 2, y - 1.2, 1.2, 'F')
                    txt(item, ML + 6, y, { size: 8 })
                    y += 6
                })
            }
        }

        // ── CONDICIONES ────────────────────────────────────────────────────
        y += 2; ln(y, grisCla); y += 5
        txt('CONDICIONES', ML, y, { size: 6.5, color: naranja, bold: true })
        y += 5

        const cols3 = [
            { label: 'Plazo',       value: form.plazo },
            { label: 'Pago',        value: form.condiciones_pago },
            { label: 'Vigencia',    value: form.validez },
        ]
        cols3.forEach((c, i) => {
            const x = ML + i * (CW / 3)
            txt(c.label, x, y,     { size: 6.5, color: gris })
            txt(c.value, x, y + 5, { size: 8.5, bold: true })
        })
        y += 14

        // ── NOTA ADICIONAL ─────────────────────────────────────────────────
        if (form.nota_adicional.trim()) {
            ln(y, grisCla); y += 5
            const nLines = doc.splitTextToSize(form.nota_adicional, CW)
            ft(8); rgb(gris); doc.text(nLines, ML, y)
            y += (nLines.length - 1) * 3.5 + 7
        }

        // ── CAJA DE INVERSIÓN ──────────────────────────────────────────────
        const boxH = 22
        const boxY = Math.max(y + 4, H - 55)

        fill(oscuro); doc.roundedRect(ML, boxY, CW, boxH, 2, 2, 'F')
        fill(naranja); doc.roundedRect(ML, boxY, CW * 0.38, boxH, 2, 2, 'F')
        // fix right side of left box so it's flush
        fill(naranja); doc.rect(ML + CW * 0.38 - 3, boxY, 3, boxH, 'F')

        txt('INVERSIÓN', ML + 5, boxY + 6, { size: 6, color: blanco })
        txt(
            isRecurr ? `${valorNum.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF /mes` : `${valorNum.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF`,
            ML + 5, boxY + 15, { size: 14, bold: true, color: blanco }
        )
        txt(`$${valorCLP.toLocaleString('es-CL')} + IVA`, W - MR - 5, boxY + 10, { size: 10, bold: true, color: blanco, align: 'right' })
        txt(`UF ${form.fecha}: $${(ufActual || 38000).toLocaleString('es-CL')}`, W - MR - 5, boxY + 17, { size: 7, color: grisCla, align: 'right' })

        // ── PIE ────────────────────────────────────────────────────────────
        const footY = H - 10
        ln(footY - 4, grisCla)
        txt('The Human Org SpA', ML, footY, { size: 7, color: gris })
        txt('hola@tho.cl · tho.cl · Concepción, Chile', W / 2, footY, { size: 7, color: gris, align: 'center' })
        txt('Confidencial', W - MR, footY, { size: 7, color: grisCla, align: 'right' })

        const filename = `Propuesta_THO_${(form.cliente || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
        doc.save(filename)
    }

    const cls = "w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-naranja"

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[60] overflow-y-auto py-6" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Generar propuesta</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{form.cliente}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">✕</button>
                </div>

                <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4">

                    {/* Cliente / Contacto */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Cliente</label>
                            <input value={form.cliente} onChange={set('cliente')} className={cls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Contacto</label>
                            <input value={form.contacto} onChange={set('contacto')} className={cls} />
                        </div>
                    </div>

                    {/* Tipo + Foco */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Tipo de servicio</label>
                            <select value={form.tipo} onChange={e => updateTipo(e.target.value)} className={cls}>
                                {tiposServicio.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Foco / Alcance específico</label>
                            <input
                                value={form.foco}
                                onChange={set('foco')}
                                placeholder="Ej: Arquitectura organizacional, Liderazgo directivo…"
                                className={cls}
                            />
                        </div>
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Descripción del servicio</label>
                        <textarea
                            value={form.descripcion}
                            onChange={set('descripcion')}
                            rows={3}
                            placeholder="Describe el alcance, contexto y objetivo principal de este servicio para este cliente específico…"
                            className={cls + ' resize-none'}
                        />
                    </div>

                    {/* Entregables */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Entregables <span className="normal-case font-normal text-gray-400">(uno por línea)</span></label>
                        <textarea
                            value={form.entregables}
                            onChange={set('entregables')}
                            rows={4}
                            placeholder={"Diagnóstico inicial\nTalleres de trabajo\nInforme ejecutivo con recomendaciones\nPlan de acción"}
                            className={cls + ' resize-none'}
                        />
                    </div>

                    {/* Condiciones */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Valor (UF)</label>
                            <input type="number" step="0.01" value={form.valor_uf} onChange={set('valor_uf')} className={cls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Plazo</label>
                            <input value={form.plazo} onChange={set('plazo')} className={cls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Pago</label>
                            <select value={form.condiciones_pago} onChange={set('condiciones_pago')} className={cls}>
                                <option>Orden de compra</option>
                                <option>Transferencia</option>
                                <option>Factura 30 días</option>
                                <option>50% anticipo + 50% entrega</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Vigencia</label>
                            <select value={form.validez} onChange={set('validez')} className={cls}>
                                <option>15 días</option>
                                <option>30 días</option>
                                <option>45 días</option>
                                <option>60 días</option>
                            </select>
                        </div>
                    </div>

                    {/* Preview CLP */}
                    {form.valor_uf && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg px-4 py-2.5 flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Equivalente CLP</span>
                            <span className="font-bold text-naranja">${Math.round((parseFloat(form.valor_uf) || 0) * (ufActual || 38000)).toLocaleString('es-CL')} + IVA</span>
                        </div>
                    )}

                    {/* Nota */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nota adicional <span className="normal-case font-normal text-gray-400">(opcional)</span></label>
                        <textarea
                            value={form.nota_adicional}
                            onChange={set('nota_adicional')}
                            rows={2}
                            placeholder="Ej: Incluye viáticos Región del Biobío. Propuesta preparada en conjunto con el equipo directivo."
                            className={cls + ' resize-none'}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t dark:border-gray-700 flex gap-3">
                    <button
                        onClick={generatePDF}
                        className="flex-1 px-4 py-2.5 color-naranja text-white rounded-lg font-medium hover:opacity-90 transition text-sm"
                    >
                        Generar PDF
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}
