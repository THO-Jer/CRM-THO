import { useDroppable } from '@dnd-kit/core'
import ProspectoCard from './ProspectoCard'
import type { Prospecto } from '../../types'

interface KanbanEstado {
    id: string
    nombre: string
    emoji: string
}

interface KanbanColumnProps {
    estado: KanbanEstado
    estados: readonly KanbanEstado[]
    prospectos: Prospecto[]
    onEdit: (p: Prospecto) => void
    onDelete: (id: string) => void
    onMove: (id: string, estado: string) => void
    onCerrar: (prospecto: Prospecto, ganado: boolean) => void
    getEstadoFromKey: (key: string) => string
    onHistory: (tabla: string, id: string, nombre: string) => void
    onConvert?: (prospecto: Prospecto, tipo: 'ticket' | 'keyaccount') => void
    onDetail?: (p: Prospecto) => void
}

// Color de etapa: punto sutil en el header (reemplaza a los emojis de círculo).
const ESTADO_DOT: Record<string, string> = {
    lead_nuevo: 'bg-gray-400',
    contactado: 'bg-azul',
    reunion: 'bg-yellow-400',
    propuesta: 'bg-naranja',
    negociacion: 'bg-verde',
}

// Conceptualmente ahora es una "Section" (fila horizontal con cards adentro en grid)
// pero mantengo el nombre KanbanColumn por compatibilidad / menor diff.
export default function KanbanColumn({ estado, estados, prospectos, onEdit, onDelete, onMove, onCerrar, getEstadoFromKey: _getEstadoFromKey, onHistory, onConvert, onDetail }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id: estado.id })

    return (
        <section
            ref={setNodeRef}
            aria-label={`Etapa ${estado.nombre}`}
            className={`bg-gray-100 dark:bg-gray-800/50 rounded-xl p-4 transition-all ${isOver ? 'ring-2 ring-naranja ring-offset-2 dark:ring-offset-gray-900 bg-gray-50 dark:bg-gray-800' : ''}`}
        >
            <header className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span aria-hidden className={`w-2 h-2 rounded-full flex-shrink-0 ${ESTADO_DOT[estado.id] || 'bg-gray-400'}`}></span>
                    <span>{estado.nombre}</span>
                </h3>
                <span className="text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium px-2 py-1 rounded-full shadow-sm">
                    {prospectos.length}
                </span>
            </header>

            {prospectos.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6 italic">
                    Arrastra una tarjeta aquí o muévela desde otro nivel.
                </p>
            ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {prospectos.map(p => (
                        <ProspectoCard
                            key={p.id}
                            prospecto={p}
                            estados={estados}
                            onMove={onMove}
                            onEdit={() => onEdit(p)}
                            onDetail={() => onDetail?.(p)}
                            onDelete={() => onDelete(p.id)}
                            onCerrar={onCerrar}
                            onConvert={onConvert}
                            onHistory={() => onHistory('prospectos', p.id, p.organizacion)}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}
