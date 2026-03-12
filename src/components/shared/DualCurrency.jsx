export default function DualCurrency({ amountUF, amountCLP, ufValue, primary = 'UF', size = 'md', showLabel = false }) {
    const uf = Number(ufValue) > 0 ? Number(ufValue) : 38000;

    const hasCLP = Number.isFinite(Number(amountCLP));
    const hasUF = Number.isFinite(Number(amountUF));

    // Prioridad CLP: si existe CLP, UF se deriva desde CLP para evitar drift por cambios de UF
    const displayCLP = hasCLP
        ? Math.round(Number(amountCLP))
        : (hasUF ? Math.round(Number(amountUF) * uf) : 0);

    const displayUF = hasCLP
        ? Number((Number(amountCLP) / uf).toFixed(2))
        : (hasUF ? Number(amountUF) : 0);
    
    const sizeClasses = {
        sm: { primary: 'text-sm font-semibold', secondary: 'text-xs text-gray-500' },
        md: { primary: 'text-base font-bold', secondary: 'text-sm text-gray-600' },
        lg: { primary: 'text-xl font-bold', secondary: 'text-base text-gray-600' },
        xl: { primary: 'text-2xl font-bold', secondary: 'text-lg text-gray-600' }
    };
    
    if (primary === 'UF') {
        return (
            <div>
                <div className={sizeClasses[size].primary}>
                    {showLabel && <span className="text-gray-500 font-normal">UF </span>}
                    {displayUF?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) || '0'}
                </div>
                <div className={sizeClasses[size].secondary}>
                    ${displayCLP?.toLocaleString('es-CL') || '0'}
                </div>
            </div>
        );
    } else {
        return (
            <div>
                <div className={sizeClasses[size].primary}>
                    ${displayCLP?.toLocaleString('es-CL') || '0'}
                </div>
                <div className={sizeClasses[size].secondary}>
                    ~{displayUF?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) || '0'} UF
                </div>
            </div>
        );
    }
}
