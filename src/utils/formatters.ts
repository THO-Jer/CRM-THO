// Helpers numéricos defensivos. Antes `!amount && amount !== 0` dejaba pasar NaN
// como '$0' silenciosamente, ocultando bugs upstream.
function toFiniteNumber(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function formatCLP(amount: number | string | null | undefined): string {
    const n = toFiniteNumber(amount);
    if (n === null) return '$0';
    return '$' + Math.round(n).toLocaleString('es-CL');
}

export function formatUF(amount: number | string | null | undefined): string {
    const n = toFiniteNumber(amount);
    if (n === null) return '0 UF';
    return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' UF';
}

/**
 * Convierte CLP a UF usando la tasa almacenada en el registro (uf_dia).
 * Si el registro no tiene uf_dia (datos históricos sin tasa), usa ufFallback como aproximación.
 * Regla: NUNCA usar la UF de hoy para convertir registros históricos.
 */
export function clpToUF(
    monto_clp: unknown,
    uf_dia: unknown,
    ufFallback: number
): number {
    const monto = toFiniteNumber(monto_clp) ?? 0
    const tasa = toFiniteNumber(uf_dia)
    const divisor = (tasa && tasa > 0) ? tasa : ufFallback
    return divisor > 0 ? monto / divisor : 0
}

export function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-CL');
}

export function formatDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export function getNombreMes(month: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[month] || '';
}

export function formatNumber(num: number | string | null | undefined): string {
    const n = toFiniteNumber(num);
    if (n === null) return '0';
    return n.toLocaleString('es-CL');
}

export function formatFileSize(bytes: number | null | undefined): string {
    const n = toFiniteNumber(bytes);
    if (n === null || n <= 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

export async function obtenerUFHoy(): Promise<number> {
    try {
        const res = await fetch('https://mindicador.cl/api/uf');
        const data = await res.json();
        if (data?.serie?.[0]?.valor) return Math.round(data.serie[0].valor);
    } catch (e) {
        console.warn('No se pudo obtener UF del día', e);
    }
    return 38000;
}
