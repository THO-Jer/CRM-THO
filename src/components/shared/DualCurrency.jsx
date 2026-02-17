export default function DualCurrency({ amountUF, amountCLP, ufValue, primary = 'UF', size = 'md', showLabel = false }) {
    const uf = ufValue || 38000;
    
    // Calcular valores según lo que venga
    let displayUF = amountUF;
    let displayCLP = amountCLP;
    
    if (amountUF && !amountCLP) {
        displayCLP = Math.round(amountUF * uf);
    } else if (amountCLP && !amountUF) {
        displayUF = Math.round((amountCLP / uf) * 100) / 100;
    }
    
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
