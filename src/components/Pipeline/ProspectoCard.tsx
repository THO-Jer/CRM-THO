import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { MoreHorizontal, Calendar, History, Pencil, Trash2, XCircle, CheckCircle2, ArrowRightCircle } from 'lucide-react'
import { todayYMD } from '../../utils/formatters'
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
    const [menuOpen, setMenuOpen] = useState(false)
    // Vencido = fecha límite ANTERIOR a hoy. Comparación de strings YYYY-MM-DD:
    // con new Date() el card aparecía vencido durante todo el día de la fecha límite (bug UTC).
    const isOverdue = prospecto.fecha_limite && String(prospecto.fecha_limite).slice(0, 10) < todayYMD()

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
        setMenuOpen(false)
    }

    const menuItem = 'w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition'

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md border transition-shadow ${isOverdue ? 'border-red-300 dark:border-red-900' : 'border-gray-100 dark:border-gray-700'}`}
        >
            {/* Cabecera: drag handle + menú de acciones */}
            <div className="flex items-start gap-2 mb-1.5">
                <div
                    {...attributes}
                    {...listeners}
                    className="flex-1 min-w-0 cursor-grab active:cursor-grabbing touch-none select-none"
                    title="Arrastra para mover de estado"
                >
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {prospecto.organizacion}
                    </h4>
                </div>
                <button
                    onClick={(e) => { stop(e); setMenuOpen(!menuOpen) }}
                    onPointerDown={stop}
                    className="p-1 -m-1 rounded text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition flex-shrink-0"
                    title="Acciones"
                    aria-label="Acciones"
                >
                    <MoreHorizontal size={16} />
                </button>
            </div>

            {/* Body: click abre el detail */}
            <div onClick={() => onDetail()} className="cursor-pointer">
                {prospecto.contacto && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">{prospecto.contacto}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <span className="text-[11px] font-medium tnum px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-naranja">{prospecto.valor} UF</span>
                    <span className="text-[11px] font-medium tnum px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-verde">{prospecto.probabilidad}%</span>
                    <span className={`text-[11px] flex items-center gap-1 ml-auto ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                        <Calendar size={11} /> {prospecto.fecha_limite || '—'}
                    </span>
                </div>
                {prospecto.proximo_paso && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{prospecto.proximo_paso}</p>
                )}
            </div>

            {/* Menú contextual */}
            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={(e) => { stop(e); setMenuOpen(false) }}></div>
                    <div className="absolute right-2 top-8 z-20 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 animate-fadeIn" onPointerDown={stop}>
                        <div className="px-3 py-1.5">
                            <select
                                value=""
                                onChange={handleMove}
                                onClick={stop}
                                className="w-full text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
                            >
                                <option value="">Mover a...</option>
                                {estados
                                    .filter(es => es.nombre !== prospecto.estado)
                                    .map(es => (
                                        <option key={es.id} value={es.nombre}>{es.nombre}</option>
                                    ))}
                            </select>
                        </div>
                        <button onClick={(e) => { stop(e); onHistory?.(); setMenuOpen(false) }} className={menuItem}><History size={13} /> Historial</button>
                        <button onClick={(e) => { stop(e); onEdit(); setMenuOpen(false) }} className={menuItem}><Pencil size={13} /> Editar</button>
                        <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                        <button onClick={(e) => { stop(e); onConvert?.(prospecto, 'ticket'); setMenuOpen(false) }} className={menuItem}><ArrowRightCircle size={13} className="text-azul" /> Ganado → Ticket</button>
                        <button onClick={(e) => { stop(e); onConvert?.(prospecto, 'keyaccount'); setMenuOpen(false) }} className={menuItem}><CheckCircle2 size={13} className="text-verde" /> Ganado → Key Account</button>
                        <button onClick={(e) => { stop(e); onCerrar(prospecto, false); setMenuOpen(false) }} className={menuItem}><XCircle size={13} className="text-red-400" /> Perdido → Historial</button>
                        <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                        <button onClick={(e) => { stop(e); onDelete(); setMenuOpen(false) }} className={`${menuItem} text-red-500 dark:text-red-400`}><Trash2 size={13} /> Eliminar</button>
                    </div>
                </>
            )}
        </div>
    )
}
