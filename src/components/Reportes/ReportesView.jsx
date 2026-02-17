import { useState, useEffect, useMemo } from 'react'
import { Chart } from 'chart.js'

export default function ReportesView({ prospectos, cerrados, tickets, keyAccounts, ufActual }) {
    const [periodo, setPeriodo] = useState('6meses');
    
    const prepararDatosIngresos = () => {
        const hoy = new Date();
        const meses = [], mrrData = [], ticketsData = [];
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            meses.push(fecha.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }));
            const mrrTotal = keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);
            const ticketsTotal = tickets.reduce((sum, t) => {
                const monto = parseFloat(t.valor_monto) || 0;
                return sum + (t.valor_moneda === 'CLP' ? monto / (ufActual || 38000) : monto);
            }, 0);
            mrrData.push(Math.round(mrrTotal));
            ticketsData.push(Math.round(ticketsTotal));
        }
        return { labels: meses, mrr: mrrData, tickets: ticketsData };
    };
    
    const prepararDatosPipeline = () => {
        const etapas = ['Contactado', 'Reunión agendada', 'Propuesta enviada', 'Negociación'];
        const valores = etapas.map(e => Math.round(prospectos.filter(p => p.estado === e).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)));
        const counts = etapas.map(e => prospectos.filter(p => p.estado === e).length);
        return { labels: etapas, data: valores, counts };
    };
    
    const prepararDatosConversion = () => {
        const hoy = new Date();
        const meses = [], tasas = [];
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            meses.push(fecha.toLocaleDateString('es-CL', { month: 'short' }));
            const cerradosMes = cerrados.filter(c => { const f = new Date(c.fecha_cierre); return f.getMonth() === fecha.getMonth() && f.getFullYear() === fecha.getFullYear(); });
            const ganados = cerradosMes.filter(c => c.estado_final === 'Ganado').length;
            tasas.push(cerradosMes.length > 0 ? Math.round((ganados / cerradosMes.length) * 100) : 0);
        }
        return { labels: meses, data: tasas };
    };

    const datosWinLoss = useMemo(() => {
        const hoy = new Date();
        const meses = [], ganados = [], perdidos = [];
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            meses.push(fecha.toLocaleDateString('es-CL', { month: 'short' }));
            const del_mes = cerrados.filter(c => { const f = new Date(c.fecha_cierre); return f.getMonth() === fecha.getMonth() && f.getFullYear() === fecha.getFullYear(); });
            ganados.push(del_mes.filter(c => c.estado_final === 'Ganado').length);
            perdidos.push(del_mes.filter(c => c.estado_final === 'Perdido').length);
        }
        return { labels: meses, ganados, perdidos };
    }, [cerrados]);

    const datosAging = useMemo(() => {
        const hoy = new Date();
        const buckets = { '0-15d': 0, '16-30d': 0, '31-60d': 0, '61-90d': 0, '+90d': 0 };
        prospectos.forEach(p => {
            const dias = Math.floor((hoy - new Date(p.created_at)) / 86400000);
            if (dias <= 15) buckets['0-15d']++; else if (dias <= 30) buckets['16-30d']++; else if (dias <= 60) buckets['31-60d']++; else if (dias <= 90) buckets['61-90d']++; else buckets['+90d']++;
        });
        return { labels: Object.keys(buckets), data: Object.values(buckets) };
    }, [prospectos]);

    const datosTickets = useMemo(() => {
        return tickets.filter(t => t.status === 'Activo').map(t => ({
            nombre: `${t.ticket || ''}`.substring(0, 25), avance: t.porcentaje_avance || 0, org: t.organizacion || ''
        })).sort((a, b) => b.avance - a.avance).slice(0, 8);
    }, [tickets]);

    const datosKAHealth = useMemo(() => {
        const salud = { Activo: 0, Riesgo: 0, Crítico: 0 };
        keyAccounts.forEach(ka => { if (ka.salud === 'Crítico' || ka.salud === 'Riesgo') salud[ka.salud]++; else salud.Activo++; });
        return salud;
    }, [keyAccounts]);
    
    const datosIngresos = prepararDatosIngresos();
    const datosPipeline = prepararDatosPipeline();
    const datosConversion = prepararDatosConversion();

    useEffect(() => {
        const timeout = setTimeout(() => {
            const kill = (id) => { const c = document.getElementById(id); if (c?.chart) { c.chart.destroy(); c.chart = null; } };
            const make = (id, cfg) => { const c = document.getElementById(id); if (!c) return; kill(id); c.chart = new Chart(c, cfg); };
            
            make('chartIngresos', {
                type: 'bar', data: { labels: datosIngresos.labels, datasets: [
                    { label: 'MRR (Key Accounts)', data: datosIngresos.mrr, backgroundColor: '#10B981', borderRadius: 4 },
                    { label: 'Tickets', data: datosIngresos.tickets, backgroundColor: '#F97316', borderRadius: 4 }
                ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y} UF` } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => v + ' UF' } } } }
            });
            make('chartPipeline', {
                type: 'bar', data: { labels: datosPipeline.labels, datasets: [{ label: 'UF', data: datosPipeline.data, backgroundColor: ['#60A5FA', '#FBBF24', '#F97316', '#10B981'], borderRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.parsed.x} UF (${datosPipeline.counts[c.dataIndex]})` } } }, scales: { x: { beginAtZero: true, ticks: { callback: v => v + ' UF' } } } }
            });
            make('chartConversion', {
                type: 'line', data: { labels: datosConversion.labels, datasets: [{ label: 'Conversión', data: datosConversion.data, borderColor: '#F97316', backgroundColor: 'rgba(249,115,22,0.1)', tension: 0.3, fill: true, borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } }
            });
            make('chartWinLoss', {
                type: 'bar', data: { labels: datosWinLoss.labels, datasets: [
                    { label: 'Ganados', data: datosWinLoss.ganados, backgroundColor: '#10B981', borderRadius: 4 },
                    { label: 'Perdidos', data: datosWinLoss.perdidos, backgroundColor: '#EF4444', borderRadius: 4 }
                ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });
            make('chartAging', {
                type: 'doughnut', data: { labels: datosAging.labels, datasets: [{ data: datosAging.data, backgroundColor: ['#10B981', '#60A5FA', '#FBBF24', '#F97316', '#EF4444'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
        }, 50);
        return () => { clearTimeout(timeout); ['chartIngresos','chartPipeline','chartConversion','chartWinLoss','chartAging'].forEach(id => { const c = document.getElementById(id); if (c?.chart) { c.chart.destroy(); c.chart = null; } }); };
    }, [periodo, prospectos, cerrados]);

    const totalPipeline = Math.round(prospectos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0));
    const mrrActual = Math.round(keyAccounts.reduce((s, ka) => s + (parseFloat(ka.uf_mes) || 0), 0));
    const ticketsValor = Math.round(tickets.reduce((s, t) => { const m = parseFloat(t.valor_monto) || 0; return s + (t.valor_moneda === 'CLP' ? m / (ufActual || 38000) : m); }, 0));
    const razonesPerdida = useMemo(() => {
        const r = {}; cerrados.filter(c => c.estado_final === 'Perdido').forEach(c => { const k = c.razon_perdida || 'Sin especificar'; r[k] = (r[k]||0)+1; });
        return Object.entries(r).sort((a,b) => b[1]-a[1]).slice(0,5);
    }, [cerrados]);
    const totalGanados = cerrados.filter(c => c.estado_final === 'Ganado').length;
    const totalPerdidos = cerrados.filter(c => c.estado_final === 'Perdido').length;
    
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">📈 Reportes y Análisis</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl font-bold text-verde">{totalPipeline} UF</div>
                    <div className="text-xs text-gray-600">Pipeline Total</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl font-bold text-azul">{mrrActual} UF</div>
                    <div className="text-xs text-gray-600">MRR Actual</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl font-bold text-naranja">{ticketsValor} UF</div>
                    <div className="text-xs text-gray-600">Tickets Activos</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl font-bold text-fucsia">{prospectos.length}</div>
                    <div className="text-xs text-gray-600">Prospectos Activos</div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">💰 Ingresos Mensuales</h3>
                    <div style={{height: '250px', position: 'relative'}}><canvas id="chartIngresos"></canvas></div>
                    <div className="text-xs text-gray-500 mt-2 text-center">MRR + Tickets · Últimos 6 meses</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">🎯 Pipeline por Etapa</h3>
                    <div style={{height: '250px', position: 'relative'}}><canvas id="chartPipeline"></canvas></div>
                    <div className="text-xs text-gray-500 mt-2 text-center">Valor acumulado por etapa</div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Tasa de Conversión</h3>
                    <div style={{height: '250px', position: 'relative'}}><canvas id="chartConversion"></canvas></div>
                    <div className="text-xs text-gray-500 mt-2 text-center">% prospectos ganados por mes</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">🏆 Ganados vs Perdidos</h3>
                    <div style={{height: '250px', position: 'relative'}}><canvas id="chartWinLoss"></canvas></div>
                    <div className="text-xs text-gray-500 mt-2 text-center">Cierres por mes · Últimos 6 meses</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">⏳ Antigüedad Pipeline</h3>
                    <div style={{height: '220px', position: 'relative'}}><canvas id="chartAging"></canvas></div>
                    <div className="text-xs text-gray-500 mt-2 text-center">Días desde creación</div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">🎫 Avance Tickets</h3>
                    <div className="space-y-3">
                        {datosTickets.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin tickets activos</p>}
                        {datosTickets.map((t, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-700 font-medium truncate mr-2" title={t.nombre}>{t.nombre}</span>
                                    <span className="text-gray-500 flex-shrink-0">{t.avance}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div className={`h-2 rounded-full transition-all ${t.avance >= 75 ? 'bg-verde' : t.avance >= 50 ? 'bg-azul' : t.avance >= 25 ? 'bg-naranja' : 'bg-gray-300'}`} style={{ width: `${Math.max(4, t.avance)}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Resumen Comercial</h3>
                    <div className="mb-5">
                        <div className="text-sm font-medium text-gray-600 mb-2">Salud Key Accounts</div>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-green-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-verde">{datosKAHealth.Activo}</div><div className="text-[10px] text-gray-500">Activos</div></div>
                            <div className="flex-1 bg-yellow-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-naranja">{datosKAHealth.Riesgo}</div><div className="text-[10px] text-gray-500">Riesgo</div></div>
                            <div className="flex-1 bg-red-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-red-500">{datosKAHealth.Crítico}</div><div className="text-[10px] text-gray-500">Crítico</div></div>
                        </div>
                    </div>
                    <div className="mb-5">
                        <div className="text-sm font-medium text-gray-600 mb-2">Historial Cierres</div>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-green-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-verde">{totalGanados}</div><div className="text-[10px] text-gray-500">Ganados</div></div>
                            <div className="flex-1 bg-red-50 rounded-lg p-3 text-center"><div className="text-xl font-bold text-red-500">{totalPerdidos}</div><div className="text-[10px] text-gray-500">Perdidos</div></div>
                        </div>
                    </div>
                    {razonesPerdida.length > 0 && (
                        <div>
                            <div className="text-sm font-medium text-gray-600 mb-2">Top Razones de Pérdida</div>
                            <div className="space-y-1.5">
                                {razonesPerdida.map(([razon, count], i) => (
                                    <div key={i} className="flex justify-between text-xs"><span className="text-gray-600 truncate mr-2">{razon}</span><span className="text-gray-500 font-medium">{count}</span></div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
