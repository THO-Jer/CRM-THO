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
    // Sin UF conocida NO se inventa una conversión (antes caía a 38.000 fijo).
    const uf = Number(ufValue) > 0 ? Number(ufValue) : 0

    // Montos pueden venir como string desde Supabase (numeric) → normalizar
    const nUF = amountUF != null && amountUF !== ('' as unknown) ? Number(amountUF) : undefined
    const nCLP = amountCLP != null && amountCLP !== ('' as unknown) ? Number(amountCLP) : undefined

    let displayUF = nUF !== undefined && Number.isFinite(nUF) ? nUF : undefined
    let displayCLP = nCLP !== undefined && Number.isFinite(nCLP) ? Math.round(nCLP) : undefined

    if (displayUF && !displayCLP && uf) {
        displayCLP = Math.round(displayUF * uf)
    } else if (displayCLP && !displayUF && uf) {
        displayUF = Math.round((displayCLP / uf) * 100) / 100
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
