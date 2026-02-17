import KanbanColumn from './KanbanColumn'

export default function KanbanBoard({estados, prospectosPorEstado, onEdit, onDelete, onMove, onCerrar, getEstadoFromKey, onHistory, onConvert, onDetail}) {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide md:grid md:grid-cols-4 md:overflow-visible">
            {estados.map(estado => (
                <div key={estado.id} className="min-w-[280px] md:min-w-0 flex-shrink-0 md:flex-shrink">
                    <KanbanColumn onDetail={onDetail} onHistory={onHistory} estado={estado} prospectos={prospectosPorEstado(estado.id)} onEdit={onEdit} onDelete={onDelete} onMove={onMove} onCerrar={onCerrar} getEstadoFromKey={getEstadoFromKey} onConvert={onConvert} />
                </div>
            ))}
        </div>
    );
}
