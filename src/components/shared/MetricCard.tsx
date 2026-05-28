// Mapa estático de colores. Tailwind sólo compila classes que ve como strings
// completos; antes usábamos `border-${color}` y `text-${color}` lo que rompía
// para colores no listados explícitamente como utilities custom (ej: "red").
const COLOR_MAP: Record<string, string> = {
    verde:   'border-verde text-verde',
    naranja: 'border-naranja text-naranja',
    azul:    'border-azul text-azul',
    red:     'border-red-500 text-red-600',
    yellow:  'border-yellow-500 text-yellow-600',
    blue:    'border-blue-500 text-blue-600',
    gray:    'border-gray-400 text-gray-600',
}

interface MetricCardProps {
    title: string
    value: string | number
    subtitle?: string
    color?: keyof typeof COLOR_MAP
}

export default function MetricCard({ title, value, subtitle, color = 'gray' }: MetricCardProps) {
    const classes = COLOR_MAP[color] ?? COLOR_MAP.gray
    const [borderCls, textCls] = classes.split(' ')
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 ${borderCls} hover:shadow-md transition-shadow`}>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{title}</div>
            <div className={`text-3xl font-bold ${textCls} mb-1`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
        </div>
    )
}
