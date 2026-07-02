import { useState } from 'react'
import useEscapeKey from '../../hooks/useEscapeKey'
import type { Ticket } from '../../types'

interface CloseTicketSubmitData {
    alsoClosed: boolean
    closedOutcome: string | null
    ufValue: string
    lossReason: string
}

interface CloseTicketModalProps {
    ticket: Ticket | null
    onSubmit: (data: CloseTicketSubmitData) => Promise<void>
    onClose: () => void
}

/**
 * Modal de finalización de ticket. Reemplaza el flujo previo de cuatro
 * window.confirm/prompt nativos seguidos (UX horrible en móvil).
 *
 * Props:
 *  - ticket: el ticket a cerrar.
 *  - onSubmit({alsoClosed, closedOutcome, ufValue, lossReason}) — async,
 *    el caller ejecuta la mutación en Supabase. Si throw, se muestra al usuario.
 *  - onClose: cerrar sin finalizar.
 */
export default function CloseTicketModal({ ticket, onSubmit, onClose }: CloseTicketModalProps) {
    useEscapeKey(onClose)

    const [alsoClosed, setAlsoClosed] = useState(true)
    const [closedOutcome, setClosedOutcome] = useState('Ganado')
    const [ufValue, setUfValue] = useState(ticket?.valor_monto ? String(ticket.valor_monto) : '')
    const [lossReason, setLossReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault?.()
        if (submitting) return
        setSubmitting(true)
        setError(null)
        try {
            await onSubmit({
                alsoClosed,
                closedOutcome: alsoClosed ? closedOutcome : null,
                ufValue: alsoClosed && ufValue ? ufValue.trim() : '',
                lossReason: alsoClosed && closedOutcome === 'Perdido' ? lossReason.trim() : ''
            })
        } catch (err) {
            setError((err as Error)?.message || 'No se pudo finalizar el ticket')
            setSubmitting(false)
        }
        // En el camino feliz el modal se cierra desde fuera (onSubmit resuelve
        // y App.jsx llama setCloseTicketOpen(false)), por eso no apagamos
        // submitting acá — evita un flash de "Finalizar" antes del cierre.
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <form
                onSubmit={handleSubmit}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            >
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Finalizar ticket</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                            {ticket?.organizacion} — {ticket?.ticket}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-xl">✕</button>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
                    El ticket pasará a estado <span className="font-semibold">Cerrado</span> con avance 100%.
                </div>

                {/* Toggle: registrar también en Cerrados */}
                <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <input
                        type="checkbox"
                        checked={alsoClosed}
                        onChange={(e) => setAlsoClosed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-naranja"
                    />
                    <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            Registrar en <span className="font-semibold">Historial</span> (Cerrados)
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Recomendado para mantener métricas. Después puedes reactivar/convertir desde ahí.
                        </div>
                    </div>
                </label>

                {/* Campos extra — solo visibles si va a Cerrados */}
                {alsoClosed && (
                    <div className="space-y-3 pl-1">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">¿Cómo terminó?</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setClosedOutcome('Ganado')}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                                        closedOutcome === 'Ganado'
                                            ? 'bg-verde border-verde text-white'
                                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/70'
                                    }`}
                                >
                                    Ganado
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClosedOutcome('Perdido')}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                                        closedOutcome === 'Perdido'
                                            ? 'bg-red-600 border-red-600 text-white'
                                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/70'
                                    }`}
                                >
                                    Perdido / Cancelado
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Valor del ticket <span className="text-gray-400 dark:text-gray-500 font-normal">(UF, opcional)</span>
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={ufValue}
                                onChange={(e) => setUfValue(e.target.value)}
                                placeholder="Ej: 25"
                                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-naranja"
                            />
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Para que aparezca en métricas de ingresos. Dejar vacío si no aplica.</p>
                        </div>

                        {closedOutcome === 'Perdido' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Motivo <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    value={lossReason}
                                    onChange={(e) => setLossReason(e.target.value)}
                                    placeholder="Ej: cliente pausó proyecto, cambio de prioridades..."
                                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-naranja"
                                />
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-lg p-3 text-xs text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-naranja text-white font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? 'Finalizando…' : 'Finalizar ticket'}
                    </button>
                </div>
            </form>
        </div>
    )
}
