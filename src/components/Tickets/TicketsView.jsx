export default function TicketsView({tickets: allTickets, onAdd, onEdit, onDelete, onExport, onHistory, onClose, onFiles, onDetail}) {
    // Filter out closed/finalized tickets
    const tickets = allTickets.filter(t => t.status !== 'Cerrado');
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="text-2xl font-bold dark:text-gray-100">Tickets</h2>
                <div className="flex space-x-3">
                    <button onClick={onExport} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm">📥 CSV</button>
                    <button onClick={onAdd} className="px-4 py-2 color-naranja text-white rounded-lg text-sm whitespace-nowrap">+ Nuevo</button>
                </div>
            </div>
            
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Organización</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ticket</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fase</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Avance</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entrega</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                        {tickets.length === 0 ? <tr><td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</td></tr> : tickets.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition" onClick={() => onDetail && onDetail(t)}>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-naranja transition">{t.organizacion}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{t.ticket}</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{t.valor_monto ? (t.valor_moneda === 'CLP' ? `$${Math.round(t.valor_monto).toLocaleString('es-CL')}` : `${t.valor_monto} UF`) : '-'}</td>
                                <td className="px-6 py-4 text-sm dark:text-gray-300">{t.fase_actual}</td>
                                <td className="px-6 py-4"><div className="flex items-center"><div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-2 mr-2"><div className="color-naranja h-2 rounded-full" style={{ width: `${t.porcentaje_avance || 0}%` }}></div></div><span className="text-xs dark:text-gray-400">{t.porcentaje_avance || 0}%</span></div></td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{t.fecha_entrega}</td>
                                <td className="px-6 py-4 text-right text-sm space-x-2" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700">📎</button>
                                    <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700">🕘</button>
                                    <button onClick={() => onClose && onClose(t)} className="text-verde text-xs">Finalizar</button>
                                    <button onClick={() => onDelete(t.id)} className="text-red-400 hover:text-red-600">🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="md:hidden space-y-3">
                {tickets.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin datos</div>
                ) : tickets.map(t => (
                    <div key={t.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition" onClick={() => onDetail && onDetail(t)}>
                        <div className="flex justify-between items-start mb-2">
                            <div><h3 className="font-bold dark:text-gray-100">{t.organizacion}</h3><p className="text-sm text-gray-500 dark:text-gray-400">{t.ticket}</p></div>
                            {t.valor_monto && <span className="text-sm font-medium text-verde">{t.valor_moneda === 'CLP' ? `$${Math.round(t.valor_monto).toLocaleString('es-CL')}` : `${t.valor_monto} UF`}</span>}
                        </div>
                        <div className="flex items-center gap-3 mb-2 text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{t.fase_actual}</span>
                            <div className="flex items-center flex-1"><div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className="color-naranja h-1.5 rounded-full" style={{ width: `${t.porcentaje_avance || 0}%` }}></div></div><span className="text-xs ml-2 dark:text-gray-400">{t.porcentaje_avance||0}%</span></div>
                            <span className="text-xs text-gray-400">{t.fecha_entrega}</span>
                        </div>
                        <div className="flex gap-2 pt-2 border-t dark:border-gray-700" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onFiles && onFiles('tickets', t.id, t.organizacion)} className="flex-1 text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition">📎</button>
                            <button onClick={() => onHistory('tickets', t.id, t.organizacion)} className="flex-1 text-xs py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition">🕘</button>
                            <button onClick={() => onClose && onClose(t)} className="flex-1 text-xs py-1.5 text-verde hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition">Finalizar</button>
                            <button onClick={() => onDelete(t.id)} className="flex-1 text-xs py-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition">🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
