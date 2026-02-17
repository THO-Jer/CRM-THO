import ProspectoCard from './ProspectoCard'

export default function KanbanColumn({estado, prospectos, onEdit, onDelete, onMove, onCerrar, getEstadoFromKey, onHistory, onConvert, onDetail}) {
    const handleDragStart = (e, p) => { e.dataTransfer.setData('prospectoId', p.id); e.currentTarget.classList.add('dragging'); };
    const handleDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDrop = (e) => { e.preventDefault(); const id = e.dataTransfer.getData('prospectoId'); onMove(id, getEstadoFromKey(estado.id)); };

    return (
        <div className="bg-gray-100 rounded-lg p-4 kanban-column min-h-[200px]" onDragOver={handleDragOver} onDrop={handleDrop}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">{estado.emoji} {estado.nombre}</h3>
                <span className="text-xs bg-white text-gray-600 font-medium px-2 py-1 rounded-full shadow-sm">{prospectos.length}</span>
            </div>
            <div className="space-y-3">
                {prospectos.length === 0 && <p className="text-sm text-gray-400 text-center py-8 italic">Sin prospectos</p>}
                {prospectos.map(p => <ProspectoCard key={p.id} prospecto={p} onEdit={() => onEdit(p)} onDetail={() => onDetail && onDetail(p)} onDelete={() => onDelete(p.id)} onCerrar={onCerrar} onConvert={onConvert} onHistory={() => onHistory('prospectos', p.id, p.organizacion)} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />)}
            </div>
        </div>
    );
}
