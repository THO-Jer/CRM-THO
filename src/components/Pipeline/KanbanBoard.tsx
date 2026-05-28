import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'
import type { Prospecto } from '../../types'

interface KanbanEstado {
    id: string
    nombre: string
    emoji: string
}

interface KanbanBoardProps {
    estados: readonly KanbanEstado[]
    prospectosPorEstado: (estadoKey: string) => Prospecto[]
    onEdit: (p: Prospecto) => void
    onDelete: (id: string) => void
    onMove: (id: string, estado: string) => void
    onCerrar: (prospecto: Prospecto, ganado: boolean) => void
    getEstadoFromKey: (key: string) => string
    onHistory: (tabla: string, id: string, nombre: string) => void
    onConvert?: (prospecto: Prospecto, tipo: 'ticket' | 'keyaccount') => void
    onDetail?: (p: Prospecto) => void
}

export default function KanbanBoard({ estados, prospectosPorEstado, onEdit, onDelete, onMove, onCerrar, getEstadoFromKey, onHistory, onConvert, onDetail }: KanbanBoardProps) {
    // Sensores para input variado: mouse (PointerSensor) y touch (TouchSensor).
    // distance:8 evita activar drag con clicks pequeños accidentales en desktop.
    // delay:200ms en touch permite que un tap rápido en el card abra el detail
    // mientras que un long-press (200ms+) activa el drag.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor),
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!active || !over) return
        const prospectoId = String(active.id)
        const targetEstadoKey = String(over.id)
        const nuevoEstado = getEstadoFromKey(targetEstadoKey)
        if (!nuevoEstado) return
        onMove(prospectoId, nuevoEstado)
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-4 pb-4">
                {estados.map(estado => (
                    <KanbanColumn
                        key={estado.id}
                        estado={estado}
                        estados={estados}
                        prospectos={prospectosPorEstado(estado.id)}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onMove={onMove}
                        onCerrar={onCerrar}
                        getEstadoFromKey={getEstadoFromKey}
                        onHistory={onHistory}
                        onConvert={onConvert}
                        onDetail={onDetail}
                    />
                ))}
            </div>
        </DndContext>
    )
}
