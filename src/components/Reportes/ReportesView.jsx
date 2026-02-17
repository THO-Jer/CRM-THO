import { useState, useEffect } from 'react'
import { Chart } from 'chart.js'

export default function ReportesView({ prospectos, cerrados, tickets, keyAccounts, ufActual }) {
    const [periodo, setPeriodo] = useState('6meses');
    
    // Preparar datos para gráficos
    const prepararDatosIngresos = () => {
        const hoy = new Date();
        const meses = [];
        const mesesData = [];
        
        // Generar últimos 6 meses
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            const mesNombre = fecha.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
            meses.push(mesNombre);
            
            // Calcular MRR + Tickets del mes (simplificado: asumimos constante)
            const mrrTotal = keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);
            const ticketsTotal = tickets.reduce((sum, t) => {
                const monto = parseFloat(t.valor_monto) || 0;
                if (t.valor_moneda === 'CLP') {
                    return sum + (monto / (ufActual || 38000));
                }
                return sum + monto;
            }, 0);
            
            mesesData.push(Math.round(mrrTotal + ticketsTotal));
        }
        
        return { labels: meses, data: mesesData };
    };
    
    const prepararDatosPipeline = () => {
        const etapas = ['Contactado', 'Reunión agendada', 'Propuesta enviada', 'Negociación'];
        const valores = etapas.map(etapa => {
            return Math.round(prospectos
                .filter(p => p.estado === etapa)
                .reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0));
        });
        
        return { labels: etapas, data: valores };
    };
    
    const prepararDatosConversion = () => {
        const hoy = new Date();
        const meses = [];
        const tasas = [];
        
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
            const mesNombre = fecha.toLocaleDateString('es-CL', { month: 'short' });
            const mes = fecha.getMonth();
            const año = fecha.getFullYear();
            
            meses.push(mesNombre);
            
            // Calcular conversión del mes
            const cerradosMes = cerrados.filter(c => {
                const f = new Date(c.fecha_cierre);
                return f.getMonth() === mes && f.getFullYear() === año;
            });
            
            const ganados = cerradosMes.filter(c => c.estado_final === 'Ganado').length;
            const tasa = cerradosMes.length > 0 ? Math.round((ganados / cerradosMes.length) * 100) : 0;
            tasas.push(tasa);
        }
        
        return { labels: meses, data: tasas };
    };
    
    const datosIngresos = prepararDatosIngresos();
    const datosPipeline = prepararDatosPipeline();
    const datosConversion = prepararDatosConversion();

    useEffect(() => {
        // Chart is imported at top level
        
        const timeout = setTimeout(() => {
            const createChart = (id, type, data, color, opts = {}) => {
                const canvas = document.getElementById(id);
                if (!canvas) return;
                if (canvas.chart) {
                    canvas.chart.destroy();
                    canvas.chart = null;
                }
                const isBar = type === 'bar';
                canvas.chart = new Chart(canvas, {
                    type,
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: opts.label || '',
                            data: data.data,
                            borderColor: color,
                            backgroundColor: isBar ? (opts.dataset && opts.dataset.backgroundColor ? opts.dataset.backgroundColor : color) : color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                            tension: 0.3,
                            fill: !isBar,
                            borderWidth: isBar ? 0 : 2,
                            borderRadius: isBar ? 4 : 0,
                            ...(opts.dataset || {})
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'bottom' },
                            tooltip: {
                                callbacks: {
                                    label: function(c) { return ' ' + c.dataset.label + ': ' + c.parsed.y + (opts.suffix || ' UF'); }
                                }
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, ...(opts.yAxis || {}), ticks: { callback: function(v) { return v + (opts.suffix || ' UF'); }, ...(opts.yAxis && opts.yAxis.ticks ? opts.yAxis.ticks : {}) } },
                            x: { ticks: { font: { size: 11 } } }
                        }
                    }
                });
            };
            
            createChart('chartIngresos', 'line', datosIngresos, 'rgb(34, 197, 94)', { label: 'Ingresos' });
            createChart('chartPipeline', 'bar', datosPipeline, '', { label: 'Valor', dataset: { backgroundColor: ['#60A5FA', '#FBBF24', '#F97316', '#10B981'] } });
            createChart('chartConversion', 'line', datosConversion, 'rgb(249, 115, 22)', { label: 'Conversión', suffix: '%', yAxis: { max: 100 } });
        }, 10);
        
        return () => {
            clearTimeout(timeout);
            ['chartIngresos', 'chartPipeline', 'chartConversion'].forEach(id => {
                const canvas = document.getElementById(id);
                if (canvas?.chart) {
                    canvas.chart.destroy();
                    canvas.chart = null;
                }
            });
        };
    }, [periodo, prospectos, cerrados]);

    // Calcular métricas resumen
    const totalPipeline = Math.round(prospectos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0));
    const mrrActual = Math.round(keyAccounts.reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0));
    const ticketsValor = Math.round(tickets.reduce((sum, t) => {
        const monto = parseFloat(t.valor_monto) || 0;
        if (t.valor_moneda === 'CLP') return sum + (monto / (ufActual || 38000));
        return sum + monto;
    }, 0));
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">📈 Reportes y Análisis</h2>
            </div>
            
            {/* Métricas resumen */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-verde">{totalPipeline} UF</div>
                    <div className="text-xs text-gray-600">Pipeline Total</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-azul">{mrrActual} UF</div>
                    <div className="text-xs text-gray-600">MRR Actual</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-naranja">{ticketsValor} UF</div>
                    <div className="text-xs text-gray-600">Tickets Activos</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-fucsia">{prospectos.length}</div>
                    <div className="text-xs text-gray-600">Prospectos Activos</div>
                </div>
            </div>
            
            {/* Gráfico 1: Ingresos Mensuales */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">💰 Ingresos Mensuales (MRR + Tickets)</h3>
                <div style={{height: '256px', position: 'relative'}}>
                    <canvas id="chartIngresos"></canvas>
                </div>
                <div className="text-xs text-gray-500 mt-2 text-center">
                    Últimos 6 meses · Valores en UF
                </div>
            </div>
            
            {/* Gráfico 2: Pipeline por Etapa */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">🎯 Pipeline por Etapa</h3>
                <div style={{height: '256px', position: 'relative'}}>
                    <canvas id="chartPipeline"></canvas>
                </div>
                <div className="text-xs text-gray-500 mt-2 text-center">
                    Valor total en cada etapa · Valores en UF
                </div>
            </div>
            
            {/* Gráfico 3: Tasa de Conversión */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Tasa de Conversión Histórica</h3>
                <div style={{height: '256px', position: 'relative'}}>
                    <canvas id="chartConversion"></canvas>
                </div>
                <div className="text-xs text-gray-500 mt-2 text-center">
                    Porcentaje de prospectos ganados por mes
                </div>
            </div>
            
        </div>
    );
}
