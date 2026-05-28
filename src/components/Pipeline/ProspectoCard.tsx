import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Prospecto } from '../../types'

interface KanbanEstado {
    id: string
    nombre: string
    emoji: string
}

interface ProspectoCardProps {
    prospecto: Prospecto
    estados: readonly KanbanEstado[]
    onMove: (id: string, estado: string) => void
    onEdit: () => void
    onDetail: () => void
    onDelete: () => void
    onCerrar: (prospecto: Prospecto, ganado: boolean) => void
    onConvert?: (prospecto: Prospecto, tipo: 'ticket' | 'keyaccount') => void
    onHistory?: () => void
}

export default function ProspectoCard({ prospecto, estados, onMove, onEdit, onDetail, onDelete, onCerrar, onConvert, onHistory }: ProspectoCardProps) {
    const [showActions, setShowActions] = useState(false)
    const [moveTarget, setMoveTarget] = useState('')
    const isOverdue = prospecto.fecha_limite && new Date(prospecto.fecha_limite) < new Date()

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: prospecto.id })

    const style: React.CSSProperties = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
    }

    const stop = (e: React.SyntheticEvent) => e.stopPropagation()

    const handleMove = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const target = e.target.value
        if (target && target !== prospecto.estado) {
            onMove(prospecto.id, target)
        }
        setMoveTarget('')
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md border-l-4 transition-shadow ${isOverdue ? 'border-red-500' : 'border-azul'}`}
        >
            {/* Drag handle: cabecera con el nombre de la organización */}
            <div
                {...attributes}
                {...listeners}
                className="flex items-start gap-2 mb-2 cursor-grab active:cursor-grabbing touch-none select-none"
                title="Arrastra para mover de estado"
            >
                <span aria-hidden className="text-gray-300 dark:text-gray-600 text-lg leading-none mt-0.5">⋮⋮</span>
                <h4 className="flex-1 min-w-0 font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {prospecto.organizacion}
                </h4>
            </div>

            {/* Body: click abre el detail */}
            <div onClick={() => onDetail()} className="cursor-pointer">
                {prospecto.contacto && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 truncate">{prospecto.contacto}</p>
                )}
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2 gap-2">
                    <span className="truncate">{prospecto.tipo}</span>
                    <span className="font-semibold text-naranja whitespace-nowrap">{prospecto.valor} UF</span>
                </div>
                <div className="flex justify-between text-xs mb-2">
                    <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                        📅 {prospecto.fecha_limite || '—'}
                    </span>
                    <span className="text-verde">{prospecto.probabilidad}%</span>
                </div>
                {prospecto.proximo_paso && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{prospecto.proximo_paso}</p>
                )}
            </div>

            {/* Selector "Mover a..." — alternativa para touch o navegación rápida */}
            <select
                value={moveTarget}
                onChange={handleMove}
                onClick={stop}
                onPointerDown={stop}
                className="mt-3 w-full text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
            >
                <option value="">Mover a...</option>
                {estados
                    .filter(es => es.nombre !== prospecto.estado)
                    .map(es => (
                        <option key={es.id} value={es.nombre}>{es.emoji} {es.nombre}</option>
                    ))}
            </select>

            {/* Acciones */}
            <div className="flex space-x-1 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3">
                <button
                    onClick={(e) => { stop(e); onHistory?.() }}
                    onPointerDown={stop}
                    title="Historial"
                    className="flex-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >🕘</button>
                <button
                    onClick={(e) => { stop(e); setShowActions(!showActions) }}
                    onPointerDown={stop}
                    title="Cerrar / convertir"
                    className="flex-1 text-xs text-verde py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >🔄</button>
                <button
                    onClick={(e) => { stop(e); onEdit() }}
                    onPointerDown={stop}
                    title="Editar"
                    className="flex-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >✏️</button>
                <button
                    onClick={(e) => { stop(e); onDelete() }}
                    onPointerDown={stop}
                    title="Eliminar"
                    className="flex-1 text-xs text-red-400 hover:text-red-600 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >🗑️</button>
            </div>

            {showActions && (
                <div className="space-y-2 mt-2 pt-2 border-t dark:border-gray-700">
                    <button
                        onClick={(e) => { stop(e); onCerrar(prospecto, false); setShowActions(false) }}
                        onPointerDown={stop}
                        className="w-full text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 py-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                    >❌ Perdido → Historial</button>
                    <button
                        onClick={(e) => { stop(e); onConvert?.(prospecto, 'ticket'); setShowActions(false) }}
                        onPointerDown={stop}
                        className="w-full text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                    >✅ Ganado → Ticket</button>
                    <button
                        onClick={(e) => { stop(e); onConvert?.(prospecto, 'keyaccount'); setShowActions(false) }}
                        onPointerDown={stop}
                        className="w-full text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 py-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition"
                    >✅ Ganado → Key Account</button>
                </div>
            )}
        </div>
    )
}
