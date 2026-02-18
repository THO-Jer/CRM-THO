export function formatCLP(amount) {
  if (!amount && amount !== 0) return '$0';
  return '$' + Math.round(Number(amount)).toLocaleString('es-CL');
}

export function formatUF(amount) {
  if (!amount && amount !== 0) return '0 UF';
  return Number(amount).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' UF';
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CL');
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export function getNombreMes(month) {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[month] || '';
}

export function formatNumber(num) {
  if (!num && num !== 0) return '0';
  return Number(num).toLocaleString('es-CL');
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
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
