// Mapa estático de colores. Tailwind sólo compila classes que ve como strings
// completos. El color ahora acentúa sólo el VALOR (no un borde grueso) —
// paleta calmada: la card es neutra y el color queda para el dato.
const COLOR_MAP: Record<string, string> = {
    verde:   'text-verde',
    naranja: 'text-naranja',
    azul:    'text-azul',
    red:     'text-red-600',
    yellow:  'text-yellow-600',
    blue:    'text-blue-600',
    gray:    'text-gray-900 dark:text-gray-100',
}

interface MetricCardProps {
    title: string
    value: string | number
    subtitle?: string
    color?: keyof typeof COLOR_MAP
}

export default function MetricCard({ title, value, subtitle, color = 'gray' }: MetricCardProps) {
    const textCls = COLOR_MAP[color] ?? COLOR_MAP.gray
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow transition-shadow">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{title}</div>
            <div className={`text-2xl font-bold tnum ${textCls} mb-0.5`}>{value}</div>
            {subtitle && <div className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</div>}
        </div>
    )
}
