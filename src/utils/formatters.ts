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

/**
 * Parsea un string 'YYYY-MM-DD' como fecha LOCAL a medianoche.
 * Ojo: `new Date('2026-07-15')` se interpreta como medianoche UTC, que en
 * Chile (UTC-3/-4) es la tarde del día ANTERIOR — corría vencimientos,
 * meses y años en todos los cálculos. Usar siempre este helper para
 * fechas sin hora que vienen de la DB.
 */
export function parseLocalDate(ymd: string | null | undefined): Date | null {
    if (!ymd) return null;
    const raw = String(ymd).slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
}

/** Fecha de hoy como 'YYYY-MM-DD' en hora local. */
export function todayYMD(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Días de diferencia entre una fecha 'YYYY-MM-DD' y hoy (local).
 * Positivo = futuro, negativo = pasado, 0 = hoy. null si la fecha es inválida.
 */
export function diasDesdeHoy(ymd: string | null | undefined): number | null {
    const target = parseLocalDate(ymd);
    const hoy = parseLocalDate(todayYMD());
    if (!target || !hoy) return null;
    return Math.round((target.getTime() - hoy.getTime()) / 86400000);
}

/** Normaliza texto para búsqueda: minúsculas y sin acentos ("Pérez" → "perez"). */
export function normalizeSearch(s: string | null | undefined): string {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    // Fechas sin hora: parsear como local para no mostrar el día anterior (bug UTC)
    const local = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr)) ? parseLocalDate(dateStr) : new Date(dateStr);
    if (!local || isNaN(local.getTime())) return '-';
    return local.toLocaleDateString('es-CL');
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
        if (data?.serie?.[0]?.valor) {
            const uf = Math.round(data.serie[0].valor);
            try { localStorage.setItem('uf_cache', String(uf)); } catch { /* silencio */ }
            return uf;
        }
    } catch (e) {
        console.warn('No se pudo obtener UF del día', e);
    }
    // Fallback: última UF conocida (cache) antes que un valor hardcodeado desactualizado
    try {
        const cached = Number(localStorage.getItem('uf_cache'));
        if (Number.isFinite(cached) && cached > 0) return cached;
    } catch { /* silencio */ }
    return 39000;
}
