export default function DateRangeFilter({ desde, hasta, onChange, className = '' }) {
    const now = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    
    const presets = [
        { label: 'Este mes', d: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), h: fmt(now) },
        { label: 'Mes anterior', d: fmt(new Date(now.getFullYear(), now.getMonth()-1, 1)), h: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) },
        { label: 'Trimestre', d: fmt(new Date(now.getFullYear(), now.getMonth()-2, 1)), h: fmt(now) },
        { label: 'Este año', d: fmt(new Date(now.getFullYear(), 0, 1)), h: fmt(now) },
        { label: 'Todo', d: '', h: '' },
    ];
    
    const isActive = (p) => desde === p.d && hasta === p.h;
    
    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                {presets.map(p => (
                    <button key={p.label} onClick={() => onChange({ desde: p.d, hasta: p.h })}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition ${isActive(p) ? 'bg-white dark:bg-gray-600 text-naranja shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-1.5">
                <input type="date" value={desde || ''} onChange={e => onChange({ desde: e.target.value, hasta })} className="px-2 py-1 text-xs border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                <span className="text-xs text-gray-400">→</span>
                <input type="date" value={hasta || ''} onChange={e => onChange({ desde, hasta: e.target.value })} className="px-2 py-1 text-xs border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
            </div>
            {(desde || hasta) && (
                <span className="text-[10px] text-gray-400">
                    {desde && hasta ? `${new Date(desde+'T12:00').toLocaleDateString('es-CL',{day:'numeric',month:'short'})} – ${new Date(hasta+'T12:00').toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'})}` : ''}
                </span>
            )}
        </div>
    );
}
