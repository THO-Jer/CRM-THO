type SizeKey = 'sm' | 'md' | 'lg' | 'xl'

interface DualCurrencyProps {
    amountUF?: number | null
    amountCLP?: number | null
    ufValue?: number | null
    primary?: 'UF' | 'CLP' | string
    size?: SizeKey
    showLabel?: boolean
}

const SIZE_CLASSES: Record<SizeKey, { primary: string; secondary: string }> = {
    sm: { primary: 'text-sm font-semibold',  secondary: 'text-xs text-gray-500' },
    md: { primary: 'text-base font-bold',    secondary: 'text-sm text-gray-600' },
    lg: { primary: 'text-xl font-bold',      secondary: 'text-base text-gray-600' },
    xl: { primary: 'text-2xl font-bold',     secondary: 'text-lg text-gray-600' },
}

export default function DualCurrency({
    amountUF,
    amountCLP,
    ufValue,
    primary = 'UF',
    size = 'md',
    showLabel = false,
}: DualCurrencyProps) {
    const uf = ufValue || 38000

    let displayUF = amountUF ?? undefined
    let displayCLP = amountCLP ?? undefined

    if (amountUF && !amountCLP) {
        displayCLP = Math.round(amountUF * uf)
    } else if (amountCLP && !amountUF) {
        displayUF = Math.round((amountCLP / uf) * 100) / 100
    }

    const cls = SIZE_CLASSES[size]

    if (primary === 'UF') {
        return (
            <div>
                <div className={cls.primary}>
                    {showLabel && <span className="text-gray-500 font-normal">UF </span>}
                    {displayUF?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '0'}
                </div>
                <div className={cls.secondary}>
                    ${displayCLP?.toLocaleString('es-CL') ?? '0'}
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className={cls.primary}>
                ${displayCLP?.toLocaleString('es-CL') ?? '0'}
            </div>
            <div className={cls.secondary}>
                ~{displayUF?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '0'} UF
            </div>
        </div>
    )
}
