import { useState } from 'react'

export default function ProspectoCard({ prospecto, onEdit, onDetail, onDelete, onCerrar, onConvert, onHistory, onDragStart, onDragEnd }) {
    const [showActions, setShowActions] = useState(false);
    const isOverdue = new Date(prospecto.fecha_limite) < new Date();
    
    return (
        <div draggable onDragStart={(e) => onDragStart(e, prospecto)} onDragEnd={onDragEnd} className={`bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-move border-l-4 transition-all ${isOverdue ? 'border-red-500' : 'border-azul'}`}>
            <div onClick={() => onDetail && onDetail()} className="cursor-pointer">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 hover:text-naranja transition">{prospecto.organizacion}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{prospecto.contacto}</p>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span>{prospecto.tipo}</span>
                    <span className="font-semibold text-naranja">{prospecto.valor} UF</span>
                </div>
                <div className="flex justify-between text-xs mb-2">
                    <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}>📅 {prospecto.fecha_limite}</span>
                    <span className="text-verde">{prospecto.probabilidad}%</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{prospecto.proximo_paso}</p>
            </div>
            <div className="flex space-x-2 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3">
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex-1 text-xs text-azul">✏️ Editar</button>
                <button onClick={(e) => { e.stopPropagation(); onHistory && onHistory(); }} className="flex-1 text-xs text-gray-700 dark:text-gray-400">🕘</button>
                <button onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} className="flex-1 text-xs text-verde">🔄 Convertir</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="flex-1 text-xs text-red-500">🗑️</button>
            </div>
            {showActions && (
                <div className="space-y-2 mt-2 pt-2 border-t dark:border-gray-700">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCerrar(prospecto, false); setShowActions(false); }} 
                        className="w-full text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 py-2 rounded hover:bg-red-200"
                    >
                        ❌ Perdido → Historial
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onConvert && onConvert(prospecto, 'ticket'); setShowActions(false); }} 
                        className="w-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 py-2 rounded hover:bg-blue-200"
                    >
                        ✅ Ganado → Ticket
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onConvert && onConvert(prospecto, 'keyaccount'); setShowActions(false); }} 
                        className="w-full text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 py-2 rounded hover:bg-green-200"
                    >
                        ✅ Ganado → Key Account
                    </button>
                </div>
            )}
        </div>
    );
}
