// Helpers numéricos defensivos. Antes `!amount && amount !== 0` dejaba pasar NaN
// como '$0' silenciosamente, ocultando bugs upstream.
function toFiniteNumber(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function formatCLP(amount) {
    const n = toFiniteNumber(amount);
    if (n === null) return '$0';
    return '$' + Math.round(n).toLocaleString('es-CL');
}

export function formatUF(amount) {
    const n = toFiniteNumber(amount);
    if (n === null) return '0 UF';
    return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' UF';
}

export function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-CL');
}

export function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export function getNombreMes(month) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[month] || '';
}

export function formatNumber(num) {
    const n = toFiniteNumber(num);
    if (n === null) return '0';
    return n.toLocaleString('es-CL');
}

export function formatFileSize(bytes) {
    const n = toFiniteNumber(bytes);
    if (n === null || n <= 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

export async function obtenerUFHoy() {
    try {
        const res = await fetch('https://mindicador.cl/api/uf');
        const data = await res.json();
        if (data?.serie?.[0]?.valor) return Math.round(data.serie[0].valor);
    } catch (e) {
        console.warn('No se pudo obtener UF del día', e);
    }
    return 38000;
}
