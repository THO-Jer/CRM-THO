import { useState } from 'react'

export default function DateRangeFilter({ desde, hasta, onChange, className = '' }) {
    const presets = [
        { label: 'Este mes', fn: () => { const h = new Date(); return { desde: new Date(h.getFullYear(), h.getMonth(), 1).toISOString().split('T')[0], hasta: h.toISOString().split('T')[0] }; }},
        { label: 'Mes anterior', fn: () => { const h = new Date(); return { desde: new Date(h.getFullYear(), h.getMonth()-1, 1).toISOString().split('T')[0], hasta: new Date(h.getFullYear(), h.getMonth(), 0).toISOString().split('T')[0] }; }},
        { label: 'Trimestre', fn: () => { const h = new Date(); return { desde: new Date(h.getFullYear(), h.getMonth()-2, 1).toISOString().split('T')[0], hasta: h.toISOString().split('T')[0] }; }},
        { label: 'Este año', fn: () => { const h = new Date(); return { desde: new Date(h.getFullYear(), 0, 1).toISOString().split('T')[0], hasta: h.toISOString().split('T')[0] }; }},
        { label: 'Todo', fn: () => ({ desde: '', hasta: '' }) },
    ];
    
    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                {presets.map(p => (
                    <button key={p.label} onClick={() => onChange(p.fn())}
                        className="px-2 py-1 text-[10px] font-medium rounded transition text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-600 hover:text-gray-700 hover:shadow-sm">
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-1.5">
                <input type="date" value={desde || ''} onChange={e => onChange({ desde: e.target.value, hasta })} className="px-2 py-1 text-xs border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
                <span className="text-xs text-gray-400">→</span>
                <input type="date" value={hasta || ''} onChange={e => onChange({ desde, hasta: e.target.value })} className="px-2 py-1 text-xs border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" />
            </div>
        </div>
    );
}
