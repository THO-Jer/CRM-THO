import { formatDate } from '../../utils/formatters'

export default function HistoryModal({ open, title, items, loading, onClose }) {
    if (!open) return null;

    const formatDT = (dt) => {
        try {
            const date = new Date(dt);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Hace unos segundos';
            if (diffMins < 60) return `Hace ${diffMins} min`;
            if (diffHours < 24) return `Hace ${diffHours}h`;
            if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
            return date.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch { return dt; }
    };

    const getEventIcon = (eventType) => {
        if (eventType?.includes('insert') || eventType?.includes('created')) return '✨';
        if (eventType?.includes('update')) return '✏️';
        if (eventType?.includes('delete')) return '🗑️';
        if (eventType?.includes('stage') || eventType?.includes('moved')) return '🔄';
        if (eventType?.includes('closed')) return '✅';
        if (eventType?.includes('converted')) return '🔄';
        if (eventType?.includes('renewal')) return '🔑';
        if (eventType?.includes('cancelled')) return '❌';
        return '📝';
    };
    
    const getDetalles = (item) => {
        // Si tiene payload, extraer cambios específicos
        if (item.payload) {
            const { old: antes, new: despues } = item.payload;
            const cambios = [];
            
            if (antes && despues) {
                // Detectar cambios específicos
                const campos = ['organizacion', 'contacto', 'estado', 'fase_actual', 'valor', 'valor_monto', 
                               'valor_moneda', 'uf_mes', 'tipo', 'ticket', 'servicio', 'salud', 
                               'probabilidad', 'porcentaje_avance', 'responsable'];
                
                campos.forEach(campo => {
                    if (antes[campo] !== despues[campo] && (antes[campo] || despues[campo])) {
                        const labelCampo = campo.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        cambios.push({
                            campo: labelCampo,
                            antes: antes[campo] || '(vacío)',
                            despues: despues[campo] || '(vacío)'
                        });
                    }
                });
            }
            
            return cambios;
        }
        
        return [];
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">📜 Historial de Actividad</h3>
                        <p className="text-sm text-gray-600">{title}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl">✕</button>
                </div>

                {loading ? (
                    <div className="text-sm text-gray-600 p-4">Cargando historial...</div>
                ) : (
                    <div className="flex-1 overflow-auto border rounded-lg">
                        {(!items || items.length === 0) ? (
                            <div className="p-6 text-center">
                                <div className="text-4xl mb-2">📭</div>
                                <div className="text-sm font-medium text-gray-700 mb-1">Sin actividad registrada</div>
                                <div className="text-xs text-gray-500">
                                    Los cambios futuros se registrarán aquí automáticamente
                                </div>
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {items.map((it, idx) => {
                                    const detalles = getDetalles(it);
                                    const titulo = it.title || it.label || 'Actividad';
                                    
                                    return (
                                        <li key={idx} className="p-4 hover:bg-gray-50">
                                            <div className="flex items-start space-x-3">
                                                <span className="text-xl">{getEventIcon(it.event_type || it.label)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {titulo}
                                                        </div>
                                                        <div className="text-xs text-gray-500">{formatDT(it.created_at)}</div>
                                                    </div>
                                                    {it.email && (
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            Por: {it.email}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Mostrar detalles de cambios */}
                                                    {detalles.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            {detalles.map((detalle, i) => (
                                                                <div key={i} className="text-xs bg-gray-50 p-2 rounded">
                                                                    <span className="font-medium text-gray-700">{detalle.campo}:</span>
                                                                    <span className="text-gray-500 mx-1">{detalle.antes}</span>
                                                                    <span className="text-gray-400">→</span>
                                                                    <span className="text-gray-900 ml-1 font-medium">{detalle.despues}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    
                                                    {it.kind === 'transition' && it.payload && (
                                                        <div className="text-xs text-gray-600 mt-2 bg-blue-50 p-2 rounded">
                                                            <span className="font-medium">Transición:</span> {it.payload.from} → {it.payload.to}
                                                            {it.payload.notes && (
                                                                <div className="mt-1 text-gray-600">
                                                                    {it.payload.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                <div className="mt-4 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
