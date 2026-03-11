import { useMemo } from 'react'

export default function useMetrics({ prospectos, cerrados, tickets, keyAccounts, ufActual }) {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();
    const mesAnterior = mesActual === 0 ? 11 : mesActual - 1;
    const añoMesAnterior = mesActual === 0 ? añoActual - 1 : añoActual;

    // --- Cerrados por período ---
    const cerradosEsteMes = cerrados.filter(c => { const f = new Date(c.fecha_cierre); return f.getMonth() === mesActual && f.getFullYear() === añoActual; });
    const cerradosMesAnterior = cerrados.filter(c => { const f = new Date(c.fecha_cierre); return f.getMonth() === mesAnterior && f.getFullYear() === añoMesAnterior; });
    const ganadosEsteMes = cerradosEsteMes.filter(c => c.estado_final === 'Ganado');
    const ganadosMesAnterior = cerradosMesAnterior.filter(c => c.estado_final === 'Ganado');

    // --- MRR ---
    const mrrActual = keyAccounts.filter(ka => (ka.salud || '').toLowerCase() !== 'cerrado').reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);

    // --- Tickets activos ---
    const valorTickets = tickets.reduce((sum, t) => {
        const monto = parseFloat(t.valor_monto) || 0;
        return sum + (t.valor_moneda === 'CLP' ? monto / (ufActual || 38000) : monto);
    }, 0);

    // Exclude converted prospectos from active pipeline
    const estadosExcluidos = new Set(['Convertido', 'Eliminado']);
    const prospectosActivos = prospectos.filter(p => !estadosExcluidos.has(p.estado));

    // --- Pipeline ---
    const pipelineTotal = prospectosActivos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);
    // Weighted pipeline = value × probability for each prospect
    const pipelinePonderado = prospectosActivos.reduce((sum, p) => sum + ((parseFloat(p.valor) || 0) * ((parseFloat(p.probabilidad) || 10) / 100)), 0);

    // --- Ingresos reales este mes (cierres ganados del mes + MRR + tickets) ---
    const valorGanadoEsteMes = ganadosEsteMes.reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    const valorGanadoMesAnterior = ganadosMesAnterior.reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    const ingresosEsteMes = mrrActual + valorTickets;
    const variacionIngresos = valorGanadoMesAnterior > 0
        ? Math.round(((valorGanadoEsteMes - valorGanadoMesAnterior) / valorGanadoMesAnterior) * 100)
        : valorGanadoEsteMes > 0 ? 100 : 0;

    // --- Alertas ---
    const prospectosVencidos = prospectosActivos.filter(p => p.fecha_limite && new Date(p.fecha_limite) < hoy);
    const prospectosSinActividad = prospectosActivos.filter(p => {
        if (!p.updated_at) return false;
        return Math.floor((hoy - new Date(p.updated_at)) / (1000 * 60 * 60 * 24)) > 14;
    });
    const ticketsProximosEntrega = tickets.filter(t => {
        if (!t.fecha_entrega) return false;
        const dias = Math.ceil((new Date(t.fecha_entrega) - hoy) / (1000 * 60 * 60 * 24));
        return dias >= 0 && dias <= 7;
    });
    const keyAccountsPorRenovar = keyAccounts.filter(ka => {
        if (!ka.fin_contrato) return false;
        const dias = Math.floor((new Date(ka.fin_contrato) - hoy) / (1000 * 60 * 60 * 24));
        return dias > 0 && dias <= 30;
    });

    // --- Conversión ---
    const tasaConversion = cerrados.length > 0 ? Math.round((cerrados.filter(c => c.estado_final === 'Ganado').length / cerrados.length) * 100) : 0;
    const tasaConversionMesAnterior = cerradosMesAnterior.length > 0 ? Math.round((ganadosMesAnterior.length / cerradosMesAnterior.length) * 100) : 0;

    const metrics = {
        totalProspectos: prospectosActivos.length,
        pipelineTotal,
        pipelinePonderado,
        proximosCierres: prospectosActivos.filter(p => (parseFloat(p.probabilidad) || 0) > 60).length,
        ingresosEsteMes,
        valorTickets,
        variacionIngresos,
        valorGanadoEsteMes,
        valorGanadoMesAnterior,
        mrrActual,
        tasaConversion,
        tasaConversionMesAnterior,
        cerradosEsteMes: cerradosEsteMes.length,
        ganadosEsteMes: ganadosEsteMes.length,
        prospectosVencidos: prospectosVencidos.length,
        prospectosSinActividad: prospectosSinActividad.length,
        ticketsProximosEntrega: ticketsProximosEntrega.length,
        keyAccountsPorRenovar: keyAccountsPorRenovar.length,
        prospectosVencidosDetalle: prospectosVencidos,
        prospectosSinActividadDetalle: prospectosSinActividad,
        ticketsProximosEntregaDetalle: ticketsProximosEntrega,
        keyAccountsPorRenovarDetalle: keyAccountsPorRenovar,
    };

    // --- Kanban ---
    const estadosKanban = [
        { id: 'contactado', nombre: 'Contactado', emoji: '🔵' },
        { id: 'reunion', nombre: 'Reunión agendada', emoji: '🟡' },
        { id: 'propuesta', nombre: 'Propuesta enviada', emoji: '🟠' },
        { id: 'negociacion', nombre: 'Negociación', emoji: '🟢' }
    ];
    const getEstadoKey = (estado) => ({ 'Contactado': 'contactado', 'Reunión agendada': 'reunion', 'Propuesta enviada': 'propuesta', 'Negociación': 'negociacion' }[estado] || null);
    const getEstadoFromKey = (key) => ({ contactado: 'Contactado', reunion: 'Reunión agendada', propuesta: 'Propuesta enviada', negociacion: 'Negociación' }[key] || 'Contactado');
    const prospectosPorEstado = (estadoKey) => prospectosActivos.filter(p => getEstadoKey(p.estado) === estadoKey);

    return { metrics, estadosKanban, prospectosPorEstado, getEstadoFromKey };
}
