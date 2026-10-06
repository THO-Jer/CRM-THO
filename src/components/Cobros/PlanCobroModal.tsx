import { useState } from 'react'
import { X } from 'lucide-react'
import useEscapeKey from '../../hooks/useEscapeKey'
import { showToast } from '../../utils/toast'
import PlanCobroEditor from './PlanCobroEditor'
import { validarDraft, type PlanDraft } from '../../utils/planDraft'
import type { PlanCobro, CuotaCobro } from '../../utils/cobros'

interface Props {
    titulo: string
    subtitulo?: string
    inicial: PlanDraft
    ufHoy: number
    onGuardar: (plan: PlanCobro, cuotas: CuotaCobro[]) => Promise<unknown>
    onClose: () => void
}

/** Modal para crear o editar el plan de cobro de un Ticket / Key Account existente. */
export default function PlanCobroModal({ titulo, subtitulo, inicial, ufHoy, onGuardar, onClose }: Props) {
    useEscapeKey(onClose)
    const [draft, setDraft] = useState<PlanDraft>(inicial)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const guardar = async () => {
        const v = validarDraft(draft)
        if (v) { setError(v); return }
        setGuardando(true); setError(null)
        try {
            await onGuardar(draft.plan, draft.cuotas)
            showToast('Plan de cobro guardado', 'success')
            onClose()
        } catch (err) {
            setError((err as Error).message)
        } finally { setGuardando(false) }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titulo}</h3>
                        {subtitulo && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitulo}</p>}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Cerrar"><X size={18} /></button>
                </div>
                <PlanCobroEditor draft={draft} onChange={setDraft} ufHoy={ufHoy} />
                {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border dark:border-gray-600 text-sm">Cancelar</button>
                    <button onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg color-naranja text-white text-sm font-medium disabled:opacity-60">{guardando ? 'Guardando…' : 'Guardar plan'}</button>
                </div>
            </div>
        </div>
    )
}
