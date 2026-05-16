import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'
import { confirmModal } from '../../utils/confirmModal'
import { formatCLP, formatUF, formatDate, formatDateTime, formatNumber } from '../../utils/formatters'
import { Chart } from '../../utils/chartSetup'
import * as XLSX from 'xlsx'
import DualCurrency from '../shared/DualCurrency'
import MetricCard from '../shared/MetricCard'
import ContaModal from './ContaModal'

export default function ContabilidadView({ 
    facturasEmitidas, 
    facturasRecibidas, 
    cajaChica, 
    boletasHonorarios, 
    sueldosSocios, 
    movimientosBancarios, 
    tickets, 
    keyAccounts, 
    ufActual, 
    contaTab, 
    setContaTab, 
    monedaPreferida, 
    alertasValidacion,
    setAlertasValidacion,
    importarBoletasExcel,
    importarFacturasEmitidasExcel,
    importarFacturasRecibidasExcel,
    importarCartola,
    buscarMatches,
    aplicarConciliacion, 
    crearGastoCajaChica, 
    ignorarMovimiento, 
    onReload, 
    onFiles,
    dateRange 
}) {
        const dashboardDataRef = useRef(null);
        const [showModal, setShowModal] = useState(false);
        const [modalType, setModalType] = useState(null);
        const [editing, setEditing] = useState(null);
        const [añoSeleccionado, setAñoSeleccionado] = useState(new Date().getFullYear());

        // ===== PERÍODO UNIFICADO =====
        const [periodo, setPeriodo] = useState('mes_actual');
        const [fechaDesdeCustom, setFechaDesdeCustom] = useState('');
        const [fechaHastaCustom, setFechaHastaCustom] = useState('');
        
        // ===== FILTROS SUELDOS SOCIOS =====
        // Retiros now filtered by global dateRange via sueldosAct (defined below with other filtered arrays)
        
        // useEffect para los gráficos del dashboard
        useEffect(() => {
            if (contaTab !== 'dashboard') return;
            
            const timeout = setTimeout(() => {
                const canvasIG = document.getElementById('chartIngGastos');
                const canvasD = document.getElementById('chartDonut');
                
                if (canvasIG && dashboardDataRef.current) {
                    if (canvasIG.chart) {
                        canvasIG.chart.destroy();
                        canvasIG.chart = null;
                    }
                    canvasIG.chart = new Chart(canvasIG, {
                        type: 'bar',
                        data: {
                            labels: dashboardDataRef.current.datos6Meses.map(d => d.label),
                            datasets: [
                                {
                                    label: 'Ingresos',
                                    data: dashboardDataRef.current.datos6Meses.map(d => d.ingresos),
                                    backgroundColor: 'rgba(34, 197, 94, 0.7)',
                                    borderColor: 'rgb(34, 197, 94)',
                                    borderWidth: 1,
                                    borderRadius: 4
                                },
                                {
                                    label: 'Gastos',
                                    data: dashboardDataRef.current.datos6Meses.map(d => d.gastos),
                                    backgroundColor: 'rgba(249, 115, 22, 0.7)',
                                    borderColor: 'rgb(249, 115, 22)',
                                    borderWidth: 1,
                                    borderRadius: 4
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
                                tooltip: { callbacks: { label: function(c) { return c.dataset.label + ': ' + c.parsed.y + ' UF'; } } }
                            },
                            scales: {
                                y: { beginAtZero: true, ticks: { callback: v => v + ' UF', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                            }
                        }
                    });
                }

                if (canvasD && dashboardDataRef.current) {
                    if (canvasD.chart) {
                        canvasD.chart.destroy();
                        canvasD.chart = null;
                    }
                    const totalG = dashboardDataRef.current.gastosActual + dashboardDataRef.current.honorariosActual + dashboardDataRef.current.cajaActual;
                    canvasD.chart = new Chart(canvasD, {
                        type: 'doughnut',
                        data: {
                            labels: ['Operacionales', 'Honorarios', 'Caja Chica'],
                            datasets: [{
                                data: [
                                    totalG > 0 ? Math.round(dashboardDataRef.current.gastosActual) : 0,
                                    totalG > 0 ? Math.round(dashboardDataRef.current.honorariosActual) : 0,
                                    totalG > 0 ? Math.round(dashboardDataRef.current.cajaActual) : 0
                                ],
                                backgroundColor: ['rgba(249, 115, 22, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(168, 85, 247, 0.7)'],
                                borderColor: ['rgb(249, 115, 22)', 'rgb(59, 130, 246)', 'rgb(168, 85, 247)'],
                                borderWidth: 2,
                                hoverOffset: 6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '65%',
                            plugins: {
                                legend: { display: false },
                                tooltip: { callbacks: { label: function(c) { return c.label + ': ' + c.parsed + ' UF'; } } }
                            }
                        }
                    });
                }
            }, 100);
            
            return () => {
                clearTimeout(timeout);
                const canvasIG = document.getElementById('chartIngGastos');
                const canvasD = document.getElementById('chartDonut');
                if (canvasIG?.chart) {
                    canvasIG.chart.destroy();
                    canvasIG.chart = null;
                }
                if (canvasD?.chart) {
                    canvasD.chart.destroy();
                    canvasD.chart = null;
                }
            };
        }, [contaTab, periodo, fechaDesdeCustom, fechaHastaCustom, dateRange, facturasEmitidas, facturasRecibidas, boletasHonorarios, cajaChica, sueldosSocios]);

        const calcularRango = () => {
            const hoy = new Date();
            const y = hoy.getFullYear();
            const m = hoy.getMonth();
            switch (periodo) {
                case 'mes_actual': {
                    return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 0) };
                }
                case 'mes_anterior': {
                    const mp = m === 0 ? 11 : m - 1;
                    const yp = m === 0 ? y - 1 : y;
                    return { desde: new Date(yp, mp, 1), hasta: new Date(yp, mp + 1, 0) };
                }
                case 'trimestre': {
                    const inicio = m - 2;
                    return { desde: new Date(y, inicio, 1), hasta: new Date(y, m + 1, 0) };
                }
                case 'semestre': {
                    const inicio = m - 5;
                    return { desde: new Date(y, inicio, 1), hasta: new Date(y, m + 1, 0) };
                }
                case 'anual': {
                    return { desde: new Date(y, 0, 1), hasta: new Date(y, 11, 31) };
                }
                case 'custom': {
                    return {
                        desde: fechaDesdeCustom ? new Date(fechaDesdeCustom + 'T00:00:00') : new Date(y, 0, 1),
                        hasta: fechaHastaCustom ? new Date(fechaHastaCustom + 'T00:00:00') : new Date(y, 11, 31)
                    };
                }
                default: return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 0) };
            }
        };

        // Use global dateRange for all tabs except PL (which has its own year selector)
        const isGlobalEmpty = !dateRange?.desde && !dateRange?.hasta;
        const useGlobalDateRange = contaTab !== 'pl' && dateRange?.desde && dateRange?.hasta;

        const rango = useGlobalDateRange 
            ? { desde: new Date(dateRange.desde + 'T00:00:00'), hasta: new Date(dateRange.hasta + 'T23:59:59') }
            : isGlobalEmpty && contaTab !== 'pl'
                ? { desde: new Date(2020, 0, 1), hasta: new Date(2099, 11, 31) } // "Todo" = show all
                : calcularRango();

        const estEnRango = (fechaStr, campo) => {
            const d = new Date(fechaStr);
            // Normalizar: comparar solo fecha sin hora
            const desde = new Date(rango.desde.getFullYear(), rango.desde.getMonth(), rango.desde.getDate());
            const hasta = new Date(rango.hasta.getFullYear(), rango.hasta.getMonth(), rango.hasta.getDate());
            const valor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            return valor >= desde && valor <= hasta;
        };

        // Datos filtrados por período (excluir facturas anuladas "Reclamado")
        const facturasEmiAct = facturasEmitidas.filter(f => f.estado !== 'Reclamado' && f.estado !== 'Reclamada' && estEnRango(f.fecha_emision));
        const facturasRecAct = facturasRecibidas.filter(f => f.estado !== 'Reclamado' && f.estado !== 'Reclamada' && estEnRango(f.fecha_emision));
        const boletasAct = boletasHonorarios.filter(b => estEnRango(b.fecha));
        const cajaAct = cajaChica.filter(c => estEnRango(c.fecha));
        const movBancAct = movimientosBancarios.filter(m => estEnRango(m.fecha));
        const sueldosAct = sueldosSocios.filter(s => estEnRango(s.fecha));

        // Etiqueta del período
        const periodoLabel = () => {
            const fmt = (d) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
            if (periodo === 'mes_actual') {
                return new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            }
            if (periodo === 'mes_anterior') {
                const mp = new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1;
                const yp = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
                return new Date(yp, mp, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            }
            if (periodo === 'trimestre') return `Último trimestre (${fmt(rango.desde)} - ${fmt(rango.hasta)})`;
            if (periodo === 'semestre') return `Último semestre (${fmt(rango.desde)} - ${fmt(rango.hasta)})`;
            if (periodo === 'anual') return `Año ${new Date().getFullYear()}`;
            if (periodo === 'custom') return `${fmt(rango.desde)} - ${fmt(rango.hasta)}`;
            return '';
        };

        const handleSave = async (data) => {
            try {
                const table = modalType === 'emitida' ? 'facturas_emitidas' : 
                             modalType === 'recibida' ? 'facturas_recibidas' : 
                             modalType === 'boleta' ? 'boletas_honorarios' :
                             modalType === 'sueldo' ? 'sueldos_socios' :
                             'caja_chica';
                
                // Limpiar campos vacíos (convertir "" a null para campos numéricos)
                const cleanedData = {};
                for (const [key, value] of Object.entries(data)) {
                    if (value === '' && (key.includes('monto') || key.includes('uf_dia') || key.includes('numero'))) {
                        cleanedData[key] = null;
                    } else {
                        cleanedData[key] = value;
                    }
                }
                
                console.log('Guardando en tabla:', table);
                console.log('Datos limpios a guardar:', cleanedData);
                
                let result;
                if (editing) {
                    result = await supabase.from(table).update(cleanedData).eq('id', editing.id);
                } else {
                    result = await supabase.from(table).insert([cleanedData]);
                }
                
                console.log('Resultado:', result);
                
                if (result.error) {
                    throw new Error(result.error.message);
                }
                
                showToast('✅ Guardado exitosamente', 'success');
                setShowModal(false);
                setEditing(null);
                onReload();
            } catch (err) {
                console.error('Error completo:', err);
                showToast('Error al guardar: ' + err.message, 'error');
            }
        };
        
        const handleDelete = async (id, type) => {
            if (!(await confirmModal('¿Eliminar este registro?'))) return;
            const table = type === 'emitida' ? 'facturas_emitidas' : 
                         type === 'recibida' ? 'facturas_recibidas' : 
                         type === 'boleta' ? 'boletas_honorarios' :
                         'caja_chica';
            await supabase.from(table).delete().eq('id', id);
            onReload();
        };
        
        // Calcular métricas del período
        const totalEmitidas = facturasEmiAct.reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0);
        const totalRecibidas = facturasRecAct.reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0);
        const totalBoletas = boletasAct.reduce((sum, b) => sum + (parseFloat(b.monto_bruto_uf) || 0), 0);
        const totalCajaChica = cajaAct.reduce((sum, c) => sum + (parseFloat(c.monto_clp) || 0), 0);
        const margen = totalEmitidas - totalRecibidas - totalBoletas - (totalCajaChica / (ufActual || 38000));

        const exportarSueldosExcel = (sueldos, periodo) => {
            const datosExport = sueldos.map(s => ({
                'Socio': s.socio,
                'Mes Servicio': s.mes_servicio,
                'Fecha': s.fecha,
                'Monto CLP': parseFloat(s.monto_clp) || 0,
                'Monto UF': parseFloat(s.monto_uf) || 0,
                'UF Día': parseFloat(s.uf_dia) || ufActual,
                'Concepto': s.concepto || ''
            }));
            const totalCLP = datosExport.reduce((sum, s) => sum + s['Monto CLP'], 0);
            const totalUF = datosExport.reduce((sum, s) => sum + s['Monto UF'], 0);
            datosExport.push({ 'Socio': 'TOTAL', 'Mes Servicio': '', 'Fecha': '', 'Monto CLP': totalCLP, 'Monto UF': totalUF, 'UF Día': '', 'Concepto': '' });
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(datosExport);
            ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r + 1; R <= range.e.r; R++) {
                const cellCLP = ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
                if (cellCLP && typeof cellCLP.v === 'number') cellCLP.z = '#,##0';
                const cellUF = ws[XLSX.utils.encode_cell({ r: R, c: 4 })];
                if (cellUF && typeof cellUF.v === 'number') cellUF.z = '#,##0.00';
            }
            XLSX.utils.book_append_sheet(wb, ws, 'Retiros Socios');
            const periodoTexto = {
                'mes-actual': 'Mes_Actual', 'ultimos-3-meses': 'Ultimos_3_Meses',
                'año-actual': `Año_${new Date().getFullYear()}`,
                'personalizado': `${filtroSueldosDesde}_a_${filtroSueldosHasta}`, 'todo': 'Todos'
            }[periodo] || 'Export';
            const fechaExport = new Date().toISOString().split('T')[0];
            const nombreArchivo = `THO_Retiros_Socios_${periodoTexto}_${fechaExport}.xlsx`;
            XLSX.writeFile(wb, nombreArchivo);
            showToast(`✅ Excel exportado: ${nombreArchivo}`, 'success');
        };
        
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 className="text-2xl font-bold">
                        {contaTab === 'dashboard' && '💰 Dashboard Financiero'}
                        {contaTab === 'conciliacion' && '🏦 Conciliación Bancaria'}
                        {['pl','emitidas','recibidas','boletas','sueldos','caja'].includes(contaTab) && '📊 Estado de Resultados'}
                    </h2>
                </div>
                
                {/* Métricas resumen - solo en dashboard */}
                {contaTab === 'dashboard' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard title="💵 Emitidas" value={`${Math.round(totalEmitidas)} UF`} subtitle={`$${Math.round(totalEmitidas * ufActual).toLocaleString('es-CL')}`} color="verde" />
                    <MetricCard title="📥 Gastos" value={`${Math.round(totalRecibidas)} UF`} subtitle={`$${Math.round(totalRecibidas * ufActual).toLocaleString('es-CL')}`} color="naranja" />
                    <MetricCard title="👤 Honorarios" value={`${Math.round(totalBoletas)} UF`} subtitle={`Bruto (15.25% ret.)`} color="azul" />
                    <MetricCard title="💵 Caja Chica" value={`$${Math.round(totalCajaChica).toLocaleString('es-CL')}`} subtitle={`~${Math.round(totalCajaChica / ufActual)} UF`} color="fucsia" />
                    <MetricCard title="📊 Margen" value={`${Math.round(margen)} UF`} subtitle={margen >= 0 ? '🟢 Positivo' : '🔴 Negativo'} color={margen >= 0 ? 'verde' : 'naranja'} />
                </div>
                )}
                
                {/* Content area */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    {/* Sub-tabs only for EERR section (pl, emitidas, recibidas, etc.) */}
                    {['pl','emitidas','recibidas','boletas','sueldos','caja'].includes(contaTab) && (
                    <div className="border-b dark:border-gray-700 px-6">
                        <nav className="flex space-x-6 overflow-x-auto">
                            {[
                                { id: 'pl', nombre: '📋 Estado de Resultados' },
                                { id: 'emitidas', nombre: '📤 Emitidas' },
                                { id: 'recibidas', nombre: '📥 Recibidas' },
                                { id: 'boletas', nombre: '👤 Honorarios' },
                                { id: 'sueldos', nombre: '💼 Retiros' },
                                { id: 'caja', nombre: '💵 Caja Chica' },
                            ].map(tab => (
                                <button 
                                    key={tab.id} 
                                    onClick={() => setContaTab(tab.id)}
                                    className={`py-3 px-1 border-b-2 font-medium text-xs whitespace-nowrap ${contaTab === tab.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    {tab.nombre}
                                </button>
                            ))}
                        </nav>
                    </div>
                    )}
                    
                    <div className="p-6">
                        {/* Dashboard de Contabilidad */}
                        {contaTab === 'dashboard' && (() => {
                            const hoy = new Date();

                            // Usar los datos ya filtrados por período
                            const emitidaActual = facturasEmiAct.reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                            const gastosActual = facturasRecAct.reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                            const honorariosActual = boletasAct.reduce((s, b) => s + (parseFloat(b.monto_bruto_uf) || 0), 0);
                            const retenciones = boletasAct.reduce((s, b) => s + (parseFloat(b.monto_retencion_uf) || 0), 0);
                            const cajaActual = cajaAct.reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000);
                            const flujoNeto = emitidaActual - gastosActual - honorariosActual - cajaActual;

                            // Período anterior (mismo largo de rango, un período atrás)
                            const largo = rango.hasta - rango.desde;
                            const prevHasta = new Date(rango.desde.getTime() - 1);
                            const prevDesde = new Date(prevHasta.getTime() - largo);
                            const estEnPrev = (fechaStr) => {
                                const d = new Date(fechaStr);
                                const v = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                const pd = new Date(prevDesde.getFullYear(), prevDesde.getMonth(), prevDesde.getDate());
                                const ph = new Date(prevHasta.getFullYear(), prevHasta.getMonth(), prevHasta.getDate());
                                return v >= pd && v <= ph;
                            };
                            const emitidaAnterior = facturasEmitidas.filter(f => estEnPrev(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                            const gastosAnterior = facturasRecibidas.filter(f => estEnPrev(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);

                            // Pendientes (siempre globales, independientes del período)
                            const porCobrar = facturasEmitidas.filter(f => f.estado === 'Pendiente').reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                            const porPagar = facturasRecibidas.filter(f => f.estado === 'Pendiente').reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);

                            // Gráfico de barras: meses dentro del rango seleccionado
                            const datos6Meses = (() => {
                                const result = [];
                                // Determinar cuántos meses cubre el rango
                                const desde = rango.desde;
                                const hasta = rango.hasta;
                                let y = desde.getFullYear();
                                let m = desde.getMonth();
                                while (new Date(y, m, 1) <= hasta) {
                                    const label = new Date(y, m, 1).toLocaleDateString('es-CL', { month: 'short' });
                                    const mesDesde = new Date(y, m, 1);
                                    const mesHasta = new Date(y, m + 1, 0);
                                    const estEnMes = (fechaStr) => {
                                        const d = new Date(fechaStr);
                                        const v = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                        return v >= mesDesde && v <= mesHasta;
                                    };
                                    const ing = facturasEmitidas.filter(f => estEnMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                                    const gas = facturasRecibidas.filter(f => estEnMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0);
                                    const hon = boletasHonorarios.filter(b => estEnMes(b.fecha)).reduce((s, b) => s + (parseFloat(b.monto_bruto_uf) || 0), 0);
                                    const caj = cajaChica.filter(c => estEnMes(c.fecha)).reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000);
                                    result.push({ label, ingresos: Math.round(ing), gastos: Math.round(gas + hon + caj) });
                                    m++;
                                    if (m > 11) { m = 0; y++; }
                                }
                                return result;
                            })();

                            const totalGastosDonut = gastosActual + honorariosActual + cajaActual;

                            // Alertas
                            const alertas = [];
                            if (flujoNeto < 0) alertas.push({ tipo: 'danger', msg: `Flujo neto negativo en el período: ${Math.round(flujoNeto)} UF` });
                            if (porCobrar > 0) alertas.push({ tipo: 'warning', msg: `${Math.round(porCobrar)} UF por cobrar en facturas pendientes` });
                            if (porPagar > 0) alertas.push({ tipo: 'info', msg: `${Math.round(porPagar)} UF por pagar en facturas recibidas` });
                            if (retenciones > 0) alertas.push({ tipo: 'fiscal', msg: `${Math.round(retenciones)} UF en retenciones del período (15.25%)` });

                            const cambioIngresos = emitidaAnterior > 0 ? ((emitidaActual - emitidaAnterior) / emitidaAnterior * 100) : (emitidaActual > 0 ? null : 0);
                            const cambioGastos = gastosAnterior > 0 ? ((gastosActual - gastosAnterior) / gastosAnterior * 100) : (gastosActual > 0 ? null : 0);

                            return (
                            <div className="space-y-6">
                                {/* Alertas */}
                                {alertas.length > 0 && (
                                    <div className="space-y-2">
                                        {alertas.map((a, i) => (
                                            <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                                                a.tipo === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800' :
                                                a.tipo === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800' :
                                                a.tipo === 'fiscal' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                                'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                                            }`}>
                                                <span>{a.tipo === 'danger' ? '🔴' : a.tipo === 'warning' ? '⚠️' : a.tipo === 'fiscal' ? '💸' : 'ℹ️'}</span>
                                                <span>{a.msg}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* KPIs principales */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">💰 Ingresos</div>
                                        <DualCurrency amountUF={Math.round(emitidaActual)} ufValue={ufActual} size="lg" primary={monedaPreferida} />
                                        <div className={`text-xs mt-1 ${cambioIngresos === null ? 'text-gray-400' : cambioIngresos >= 0 ? 'text-verde' : 'text-red-500'}`}>
                                            {cambioIngresos === null ? 'Sin datos período anterior' : `${cambioIngresos >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(cambioIngresos))}% vs período anterior`}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">📥 Gastos Total</div>
                                        <DualCurrency amountUF={Math.round(gastosActual + honorariosActual + cajaActual)} ufValue={ufActual} size="lg" primary={monedaPreferida} />
                                        <div className={`text-xs mt-1 ${cambioGastos === null ? 'text-gray-400' : cambioGastos >= 0 ? 'text-red-500' : 'text-verde'}`}>
                                            {cambioGastos === null ? 'Sin datos período anterior' : `${cambioGastos >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(cambioGastos))}% vs período anterior`}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">📊 Flujo Neto</div>
                                        <DualCurrency amountUF={Math.round(flujoNeto)} ufValue={ufActual} size="lg" primary={monedaPreferida} />
                                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ingresos - Gastos</div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">💸 Retenciones</div>
                                        <DualCurrency amountUF={Math.round(retenciones)} ufValue={ufActual} size="lg" primary={monedaPreferida} />
                                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Por pagar al SII</div>
                                    </div>
                                </div>

                                {/* Pendientes */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs text-green-600 font-medium">📤 Por Cobrar</div>
                                            <DualCurrency amountUF={Math.round(porCobrar)} ufValue={ufActual} size="md" primary={monedaPreferida} />
                                            <div className="text-xs text-green-500">{facturasEmitidas.filter(f => f.estado === 'Pendiente').length} facturas</div>
                                        </div>
                                        <span className="text-3xl opacity-30">💵</span>
                                    </div>
                                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs text-orange-600 font-medium">📥 Por Pagar</div>
                                            <DualCurrency amountUF={Math.round(porPagar)} ufValue={ufActual} size="md" primary={monedaPreferida} />
                                            <div className="text-xs text-orange-500">{facturasRecibidas.filter(f => f.estado === 'Pendiente').length} facturas</div>
                                        </div>
                                        <span className="text-3xl opacity-30">📋</span>
                                    </div>
                                </div>
                                
                                {/* Alertas de Validación */}
                                {alertasValidacion.length > 0 && (
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-bold text-yellow-800">⚠️ Alertas de Validación</h4>
                                            <button 
                                                onClick={() => setAlertasValidacion([])} 
                                                className="text-yellow-600 hover:text-yellow-800 text-sm"
                                            >
                                                ✕ Cerrar
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {alertasValidacion.map((alerta, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className={`text-sm p-2 rounded ${
                                                        alerta.tipo === 'error' ? 'bg-red-100 text-red-800' :
                                                        alerta.tipo === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}
                                                >
                                                    {alerta.mensaje}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Gráficos */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Gráfico barras: Ingresos vs Gastos 6 meses */}
                                    <div className="lg:col-span-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <h4 className="font-bold text-sm mb-3">📈 Ingresos vs Gastos ({datos6Meses.length} {datos6Meses.length === 1 ? 'mes' : 'meses'})</h4>
                                        <div style={{height: '220px', position: 'relative'}}>
                                            <canvas id="chartIngGastos"></canvas>
                                        </div>
                                    </div>

                                    {/* Gráfico donut: Composición de gastos */}
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <h4 className="font-bold text-sm mb-3">🥧 Composición Gastos</h4>
                                        <div style={{height: '220px', position: 'relative'}}>
                                            <canvas id="chartDonut"></canvas>
                                        </div>
                                        <div className="mt-3 space-y-1 text-xs">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-400"></span> Operacionales</div>
                                                <span className="font-medium dark:text-gray-200">{totalGastosDonut > 0 ? Math.round(gastosActual/totalGastosDonut*100) : 0}%</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-400"></span> Honorarios</div>
                                                <span className="font-medium dark:text-gray-200">{totalGastosDonut > 0 ? Math.round(honorariosActual/totalGastosDonut*100) : 0}%</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-purple-400"></span> Caja Chica</div>
                                                <span className="font-medium dark:text-gray-200">{totalGastosDonut > 0 ? Math.round(cajaActual/totalGastosDonut*100) : 0}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Accesos rápidos */}
                                <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                    <h4 className="font-bold text-sm mb-3">⚡ Acciones Rápidas</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <button onClick={() => { setContaTab('emitidas'); setEditing(null); setModalType('emitida'); setShowModal(true); }} className="flex flex-col items-center gap-1 p-3 bg-green-50 hover:bg-green-100 rounded-lg transition">
                                            <span className="text-xl">📤</span>
                                            <span className="text-xs font-medium text-green-700">Nueva Factura</span>
                                        </button>
                                        <button onClick={() => { setContaTab('recibidas'); setEditing(null); setModalType('recibida'); setShowModal(true); }} className="flex flex-col items-center gap-1 p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition">
                                            <span className="text-xl">📥</span>
                                            <span className="text-xs font-medium text-orange-700">Nuevo Gasto</span>
                                        </button>
                                        <button onClick={() => { setContaTab('boletas'); setEditing(null); setModalType('boleta'); setShowModal(true); }} className="flex flex-col items-center gap-1 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                                            <span className="text-xl">👤</span>
                                            <span className="text-xs font-medium text-blue-700">Boleta Honor.</span>
                                        </button>
                                        <button onClick={() => { setContaTab('caja'); setEditing(null); setModalType('caja'); setShowModal(true); }} className="flex flex-col items-center gap-1 p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                                            <span className="text-xl">💵</span>
                                            <span className="text-xs font-medium text-purple-700">Caja Chica</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Guardar datos para gráficos */}
                                {(dashboardDataRef.current = { datos6Meses, gastosActual, honorariosActual, cajaActual }, null)}
                            </div>
                            );
                        })()}

                        {/* Facturas Emitidas */}
                        {contaTab === 'emitidas' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold dark:text-gray-200">Facturas Emitidas</h3>
                                    <div className="flex gap-2">
                                        <button onClick={importarFacturasEmitidasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition" title="Importar Excel del SII">📄 Importar Excel</button>
                                        <button onClick={() => { setEditing(null); setModalType('emitida'); setShowModal(true); }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva</button>
                                    </div>
                                </div>
                                
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500">✓</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">N° Factura</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Cliente</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Monto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Estado</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {facturasEmiAct.length === 0 ? (
                                                <tr><td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">Sin facturas emitidas</td></tr>
                                            ) : facturasEmiAct.map(f => (
                                                <tr key={f.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-2 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={f.estado === 'Pagada'}
                                                            onChange={async () => {
                                                                const nuevoEstado = f.estado === 'Pagada' ? 'Pendiente' : 'Pagada';
                                                                const result = await supabase
                                                                    .from('facturas_emitidas')
                                                                    .update({ estado: nuevoEstado, fecha_pago: nuevoEstado === 'Pagada' ? new Date().toISOString().split('T')[0] : null })
                                                                    .eq('id', f.id);
                                                                if (!result.error) onReload();
                                                            }}
                                                            className="w-4 h-4 text-verde cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium">{f.numero_factura}</td>
                                                    <td className="px-4 py-3 text-sm">{f.cliente}</td>
                                                    <td className="px-4 py-3 text-sm">{f.fecha_emision}</td>
                                                    <td className="px-4 py-3"><DualCurrency amountUF={f.monto_uf} amountCLP={f.monto_clp} ufValue={f.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${
                                                        f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : 
                                                        f.estado === 'Vencida' ? 'bg-red-100 text-red-800' :
                                                        f.estado === 'Reclamado' || f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>{f.estado === 'Reclamado' || f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span></td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        {f.estado !== 'Reclamado' && f.estado !== 'Reclamada' && (
                                                            <button 
                                                                onClick={async () => {
                                                                    if (await confirmModal(`¿Anular factura #${f.numero_factura}? Esta acción la excluirá de los cálculos.`)) {
                                                                        const result = await supabase
                                                                            .from('facturas_emitidas')
                                                                            .update({ estado: 'Reclamada' })
                                                                            .eq('id', f.id);
                                                                        if (!result.error) onReload();
                                                                    }
                                                                }}
                                                                className="text-gray-500 text-sm hover:text-red-600"
                                                            >
                                                                ❌
                                                            </button>
                                                        )}
                                                        <button onClick={() => { setEditing(f); setModalType('emitida'); setShowModal(true); }} className="text-azul text-sm">Editar</button>
                                                        <button onClick={() => onFiles('facturas_emitidas', f.id, `Factura ${f.numero_factura}`)} className="text-gray-700 text-sm">📎</button>
                                                        <button onClick={() => handleDelete(f.id, 'emitida')} className="text-red-600 text-sm">Eliminar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {facturasEmiAct.length === 0 ? (
                                        <div className="text-center text-sm text-gray-500 py-4">Sin facturas emitidas</div>
                                    ) : facturasEmiAct.map(f => (
                                        <div key={f.id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold dark:text-gray-200">{f.numero_factura}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">{f.cliente}</div>
                                                </div>
                                                <span className={`px-2 py-1 text-xs rounded-full ${
                                                    f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : 
                                                    f.estado === 'Vencida' ? 'bg-red-100 text-red-800' : 
                                                    f.estado === 'Reclamado' || f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' : 
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>{f.estado === 'Reclamado' || f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span>
                                            </div>
                                            <div className="text-sm space-y-1 mb-3">
                                                <div className="flex justify-between"><span className="text-gray-600">Fecha:</span><span>{f.fecha_emision}</span></div>
                                                <div className="flex justify-between items-center"><span className="text-gray-600">Monto:</span><DualCurrency amountUF={f.monto_uf} amountCLP={f.monto_clp} ufValue={f.uf_dia || ufActual} size="sm" primary="UF" /></div>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t">
                                                <button onClick={() => { setEditing(f); setModalType('emitida'); setShowModal(true); }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                                <button onClick={() => onFiles('facturas_emitidas', f.id, `Factura ${f.numero_factura}`)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                                <button onClick={() => handleDelete(f.id, 'emitida')} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Facturas Recibidas */}
                        {contaTab === 'recibidas' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold dark:text-gray-200">Facturas Recibidas (Gastos)</h3>
                                    <div className="flex gap-2">
                                        <button onClick={importarFacturasRecibidasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition" title="Importar Excel del SII">📄 Importar Excel</button>
                                        <button onClick={() => { setEditing(null); setModalType('recibida'); setShowModal(true); }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva</button>
                                    </div>
                                </div>
                                
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500">✓</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Proveedor</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Categoría</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Monto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Estado</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {facturasRecAct.length === 0 ? (
                                                <tr><td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">Sin facturas recibidas</td></tr>
                                            ) : facturasRecAct.map(f => (
                                                <tr key={f.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-2 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={f.estado === 'Pagada'}
                                                            onChange={async () => {
                                                                const nuevoEstado = f.estado === 'Pagada' ? 'Pendiente' : 'Pagada';
                                                                const result = await supabase
                                                                    .from('facturas_recibidas')
                                                                    .update({ estado: nuevoEstado, fecha_pago: nuevoEstado === 'Pagada' ? new Date().toISOString().split('T')[0] : null })
                                                                    .eq('id', f.id);
                                                                if (!result.error) onReload();
                                                            }}
                                                            className="w-4 h-4 text-verde cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium">{f.proveedor}</td>
                                                    <td className="px-4 py-3 text-sm">{f.categoria}</td>
                                                    <td className="px-4 py-3 text-sm">{f.fecha_emision}</td>
                                                    <td className="px-4 py-3"><DualCurrency amountUF={f.monto_uf} amountCLP={f.monto_clp} ufValue={f.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${
                                                        f.estado === 'Pagada' ? 'bg-green-100 text-green-800' :
                                                        f.estado === 'Reclamado' || f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>{f.estado === 'Reclamado' || f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span></td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        {f.estado !== 'Reclamado' && f.estado !== 'Reclamada' && (
                                                            <button 
                                                                onClick={async () => {
                                                                    if (await confirmModal(`¿Anular factura de ${f.proveedor}? Esta acción la excluirá de los cálculos.`)) {
                                                                        const result = await supabase
                                                                            .from('facturas_recibidas')
                                                                            .update({ estado: 'Reclamada' })
                                                                            .eq('id', f.id);
                                                                        if (!result.error) onReload();
                                                                    }
                                                                }}
                                                                className="text-gray-500 text-sm hover:text-red-600"
                                                            >
                                                                ❌
                                                            </button>
                                                        )}
                                                        <button onClick={() => { setEditing(f); setModalType('recibida'); setShowModal(true); }} className="text-azul text-sm">Editar</button>
                                                        <button onClick={() => onFiles('facturas_recibidas', f.id, `${f.proveedor} - ${f.categoria}`)} className="text-gray-700 text-sm">📎</button>
                                                        <button onClick={() => handleDelete(f.id, 'recibida')} className="text-red-600 text-sm">Eliminar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="md:hidden space-y-3">
                                    {facturasRecAct.length === 0 ? (
                                        <div className="text-center text-sm text-gray-500 py-4">Sin facturas recibidas</div>
                                    ) : facturasRecAct.map(f => (
                                        <div key={f.id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold dark:text-gray-200">{f.proveedor}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">{f.categoria}</div>
                                                </div>
                                                <span className={`px-2 py-1 text-xs rounded-full ${
                                                    f.estado === 'Pagada' ? 'bg-green-100 text-green-800' :
                                                    f.estado === 'Reclamado' || f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>{f.estado === 'Reclamado' || f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span>
                                            </div>
                                            <div className="text-sm space-y-1 mb-3">
                                                <div className="flex justify-between"><span className="text-gray-600">Fecha:</span><span>{f.fecha_emision}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-600">Monto:</span><span className="font-medium dark:text-gray-200">{f.monto_uf} UF</span></div>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t">
                                                <button onClick={() => { setEditing(f); setModalType('recibida'); setShowModal(true); }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                                <button onClick={() => onFiles('facturas_recibidas', f.id, `${f.proveedor} - ${f.categoria}`)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                                <button onClick={() => handleDelete(f.id, 'recibida')} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        
                        {/* Retiros Socios */}
                        {contaTab === 'sueldos' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center flex-wrap gap-3">
                                    <h3 className="font-bold dark:text-gray-200">Retiros Socios</h3>
                                    <div className="flex gap-2 flex-wrap">
                                        <button 
                                            onClick={() => exportarSueldosExcel(sueldosAct, 'periodo')}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
                                        >
                                            📊 Exportar Excel
                                        </button>
                                        <button onClick={() => { setEditing(null); setModalType('sueldo'); setShowModal(true); }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nuevo Retiro</button>
                                    </div>
                                </div>
                                
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Socio</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Mes Servicio</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Monto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Concepto</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {sueldosAct.length === 0 ? (
                                                <tr><td colSpan="6" className="text-center text-sm text-gray-500 py-4">Sin retiros en el período seleccionado</td></tr>
                                            ) : sueldosAct.map(s => (
                                                <tr key={s.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-4 py-3 text-sm font-medium">{s.socio}</td>
                                                    <td className="px-4 py-3 text-sm">{s.mes_servicio}</td>
                                                    <td className="px-4 py-3 text-sm">{s.fecha}</td>
                                                    <td className="px-4 py-3"><DualCurrency amountUF={s.monto_uf} amountCLP={s.monto_clp} ufValue={s.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-sm">{s.concepto}</td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        <button onClick={async () => { setEditing(s); setModalType('sueldo'); setShowModal(true); }} className="text-azul text-sm">Editar</button>
                                                        <button onClick={() => onFiles('sueldos_socios', s.id, `Retiro ${s.socio} ${s.mes_servicio}`)} className="text-gray-700 text-sm">📎</button>
                                                        <button onClick={async () => {
                                                            if (await confirmModal('¿Eliminar este retiro?')) {
                                                                await supabase.from('sueldos_socios').delete().eq('id', s.id);
                                                                onReload();
                                                            }
                                                        }} className="text-red-600 text-sm">Eliminar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {sueldosAct.length === 0 ? (
                                        <div className="text-center text-sm text-gray-500 py-4">Sin retiros en el período seleccionado</div>
                                    ) : sueldosAct.map(s => (
                                        <div key={s.id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold dark:text-gray-200">{s.socio}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">{s.mes_servicio}</div>
                                                </div>
                                            </div>
                                            <div className="text-sm space-y-1 mb-3">
                                                <div className="flex justify-between"><span className="text-gray-600">Fecha:</span><span>{s.fecha}</span></div>
                                                <div className="flex justify-between items-center"><span className="text-gray-600">Monto:</span><DualCurrency amountUF={s.monto_uf} amountCLP={s.monto_clp} ufValue={s.uf_dia || ufActual} size="sm" primary="UF" /></div>
                                                <div className="flex justify-between"><span className="text-gray-600">Concepto:</span><span>{s.concepto}</span></div>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t">
                                                <button onClick={async () => { setEditing(s); setModalType('sueldo'); setShowModal(true); }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                                <button onClick={() => onFiles('sueldos_socios', s.id, `Retiro ${s.socio} ${s.mes_servicio}`)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                                <button onClick={async () => {
                                                    if (await confirmModal('¿Eliminar este retiro?')) {
                                                        await supabase.from('sueldos_socios').delete().eq('id', s.id);
                                                        onReload();
                                                    }
                                                }} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Caja Chica */}
                        {contaTab === 'caja' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold dark:text-gray-200">Caja Chica</h3>
                                    <button onClick={() => { setEditing(null); setModalType('caja'); setShowModal(true); }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nuevo Gasto</button>
                                </div>
                                
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Concepto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Categoría</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Monto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Responsable</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {cajaAct.length === 0 ? (
                                                <tr><td colSpan="6" className="px-4 py-4 text-center text-sm text-gray-500">Sin gastos de caja chica</td></tr>
                                            ) : cajaAct.map(c => (
                                                <tr key={c.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-4 py-3 text-sm">{c.fecha}</td>
                                                    <td className="px-4 py-3 text-sm font-medium">{c.concepto}</td>
                                                    <td className="px-4 py-3 text-sm">{c.categoria}</td>
                                                    <td className="px-4 py-3 text-sm font-medium">${Math.round(c.monto_clp).toLocaleString('es-CL')}</td>
                                                    <td className="px-4 py-3 text-sm">{c.responsable}</td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        <button onClick={() => { setEditing(c); setModalType('caja'); setShowModal(true); }} className="text-azul text-sm">Editar</button>
                                                        <button onClick={() => onFiles('caja_chica', c.id, c.concepto)} className="text-gray-700 text-sm">📎</button>
                                                        <button onClick={() => handleDelete(c.id, 'caja')} className="text-red-600 text-sm">Eliminar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="md:hidden space-y-3">
                                    {cajaAct.length === 0 ? (
                                        <div className="text-center text-sm text-gray-500 py-4">Sin gastos de caja chica</div>
                                    ) : cajaAct.map(c => (
                                        <div key={c.id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold dark:text-gray-200">{c.concepto}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">{c.categoria}</div>
                                                </div>
                                                <span className="font-medium text-verde">${Math.round(c.monto_clp).toLocaleString('es-CL')}</span>
                                            </div>
                                            <div className="text-sm space-y-1 mb-3">
                                                <div className="flex justify-between"><span className="text-gray-600">Fecha:</span><span>{c.fecha}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-600">Responsable:</span><span>{c.responsable}</span></div>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t">
                                                <button onClick={() => { setEditing(c); setModalType('caja'); setShowModal(true); }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                                <button onClick={() => onFiles('caja_chica', c.id, c.concepto)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                                <button onClick={() => handleDelete(c.id, 'caja')} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Boletas de Honorarios */}
                        {contaTab === 'boletas' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold dark:text-gray-200">Boletas de Honorarios</h3>
                                    <div className="flex gap-2">
                                        <button onClick={importarBoletasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition" title="Importar Excel del SII (BHE)">📄 Importar Excel</button>
                                        <button onClick={() => { setEditing(null); setModalType('boleta'); setShowModal(true); }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva Boleta</button>
                                    </div>
                                </div>
                                
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Prestador</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Mes Servicio</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Bruto</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Retención</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Líquido</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {boletasAct.length === 0 ? (
                                                <tr><td colSpan="7" className="px-4 py-4 text-center text-sm text-gray-500">Sin boletas de honorarios</td></tr>
                                            ) : boletasAct.map(b => (
                                                <tr key={b.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-4 py-3 text-sm font-medium">{b.prestador}</td>
                                                    <td className="px-4 py-3 text-sm">{b.mes_servicio}</td>
                                                    <td className="px-4 py-3 text-sm">{b.fecha}</td>
                                                    <td className="px-4 py-3"><DualCurrency amountUF={b.monto_bruto_uf} amountCLP={b.monto_bruto_clp} ufValue={b.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-sm text-naranja">-{monedaPreferida === 'UF' ? `${b.monto_retencion_uf} UF` : `$${Math.round(b.monto_retencion_clp || 0).toLocaleString('es-CL')}`} ({b.porcentaje_retencion}%)</td>
                                                    <td className="px-4 py-3"><DualCurrency amountUF={b.monto_liquido_uf} amountCLP={b.monto_liquido_clp} ufValue={b.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right space-x-2">
                                                        <button onClick={() => { setEditing(b); setModalType('boleta'); setShowModal(true); }} className="text-azul text-sm">Editar</button>
                                                        <button onClick={() => onFiles('boletas_honorarios', b.id, `${b.prestador} - ${b.mes_servicio}`)} className="text-gray-700 text-sm">📎</button>
                                                        <button onClick={() => handleDelete(b.id, 'boleta')} className="text-red-600 text-sm">Eliminar</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {boletasAct.length === 0 ? (
                                        <div className="text-center text-sm text-gray-500 py-4">Sin boletas de honorarios</div>
                                    ) : boletasAct.map(b => (
                                        <div key={b.id} className="border rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold dark:text-gray-200">{b.prestador}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">{b.mes_servicio}</div>
                                                </div>
                                                <span className="text-sm font-medium text-verde">{b.monto_liquido_uf} UF</span>
                                            </div>
                                            <div className="text-sm space-y-1 mb-3">
                                                <div className="flex justify-between"><span className="text-gray-600">Fecha:</span><span>{b.fecha}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-600">Bruto:</span><span className="font-medium dark:text-gray-200">{b.monto_bruto_uf} UF</span></div>
                                                <div className="flex justify-between"><span className="text-gray-600">Retención:</span><span className="text-naranja">-{b.monto_retencion_uf} UF ({b.porcentaje_retencion}%)</span></div>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t">
                                                <button onClick={() => { setEditing(b); setModalType('boleta'); setShowModal(true); }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                                <button onClick={() => onFiles('boletas_honorarios', b.id, `${b.prestador} - ${b.mes_servicio}`)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                                <button onClick={() => handleDelete(b.id, 'boleta')} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        
                        {/* Conciliación Bancaria */}
                        {contaTab === 'conciliacion' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {movBancAct.length} movimientos · {movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length} pendientes
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={async () => {
                                                if (await confirmModal('¿Eliminar TODOS los movimientos bancarios? Esta acción no se puede deshacer.')) {
                                                    const { error } = await supabase.from('movimientos_bancarios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                                                    if (error) showToast('Error: ' + error.message, 'error');
                                                    else { showToast('✅ Movimientos eliminados', 'success'); onReload(); }
                                                }
                                            }}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
                                        >
                                            🗑️ Limpiar Todo
                                        </button>
                                        <button onClick={importarCartola} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">📤 Importar Cartola</button>
                                    </div>
                                </div>
                                
                                {/* Resumen - sin total acumulativo */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">⏳ Pendientes por Revisar</div>
                                        <div className="text-2xl font-bold text-orange-600">{movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length}</div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">✅ Conciliados</div>
                                        <div className="text-2xl font-bold text-verde">{movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length}</div>
                                    </div>
                                </div>
                                
                                {/* Lista de movimientos pendientes */}
                                <div className="space-y-3">
                                    {movBancAct
                                        .filter(m => m.estado_conciliacion === 'pendiente')
                                        .map(mov => {
                                            const resultado = buscarMatches(mov);
                                            const mejorMatch = resultado.matches[0];
                                            
                                            return (
                                                <div key={mov.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-1 rounded text-xs ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {mov.tipo === 'entrada' ? '📈 Entrada' : '📉 Salida'}
                                                                </span>
                                                                <span className="text-sm text-gray-600 dark:text-gray-400">{mov.fecha}</span>
                                                            </div>
                                                            <div className="font-medium mt-1">{mov.descripcion}</div>
                                                            <div className="text-lg font-bold mt-1">
                                                                <DualCurrency amountUF={mov.monto_uf} ufValue={mov.uf_dia} size="md" primary={monedaPreferida} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Sugerencia de match */}
                                                    {mejorMatch && mejorMatch.score >= 0.60 ? (
                                                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-2">
                                                            <div className="text-sm font-medium text-azul dark:text-blue-400 mb-1">
                                                                ✨ Match sugerido ({Math.round(mejorMatch.score * 100)}% confianza)
                                                            </div>
                                                            <div className="text-sm">{mejorMatch.descripcion}</div>
                                                            <div className="text-sm text-gray-600 dark:text-gray-400">${mejorMatch.monto_clp.toLocaleString('es-CL')}</div>
                                                            <button 
                                                                onClick={async () => {
                                                                    if (await confirmModal(`¿Conciliar con ${mejorMatch.descripcion}?`)) {
                                                                        aplicarConciliacion(mov.id, mejorMatch.tipo, mejorMatch.id);
                                                                    }
                                                                }}
                                                                className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
                                                            >
                                                                ✓ Aplicar Match
                                                            </button>
                                                            
                                                            {/* Mostrar otros matches si existen */}
                                                            {resultado.matches.length > 1 && (
                                                                <details className="mt-2">
                                                                    <summary className="text-xs text-gray-600 cursor-pointer">Ver otras opciones ({resultado.matches.length - 1})</summary>
                                                                    <div className="mt-2 space-y-1">
                                                                        {resultado.matches.slice(1, 4).map((match, idx) => (
                                                                            <div key={idx} className="text-xs flex justify-between items-center p-2 bg-white rounded">
                                                                                <span>{match.descripcion} ({Math.round(match.score * 100)}%)</span>
                                                                                <button 
                                                                                    onClick={async () => {
                                                                                        if (await confirmModal(`¿Conciliar con ${match.descripcion}?`)) {
                                                                                            aplicarConciliacion(mov.id, match.tipo, match.id);
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                                                                >
                                                                                    Aplicar
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </details>
                                                            )}
                                                        </div>
                                                    ) : resultado.sugerenciaCategoria ? (
                                                        <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded mb-2">
                                                            <div className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                                                                💡 Sugerencia: Crear en Caja Chica
                                                            </div>
                                                            <div className="text-sm">Categoría sugerida: {resultado.sugerenciaCategoria}</div>
                                                            <button 
                                                                onClick={async () => {
                                                                    if (await confirmModal(`¿Crear gasto en Caja Chica como "${resultado.sugerenciaCategoria}"?`)) {
                                                                        crearGastoCajaChica(mov, resultado.sugerenciaCategoria);
                                                                    }
                                                                }}
                                                                className="mt-2 px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 font-medium"
                                                            >
                                                                + Crear Gasto
                                                            </button>
                                                        </div>
                                                    ) : resultado.matches.length > 0 ? (
                                                        <div className="bg-gray-50 p-3 rounded mb-2">
                                                            <div className="text-sm font-medium text-gray-700 mb-2">
                                                                Posibles matches (baja confianza):
                                                            </div>
                                                            <div className="space-y-1">
                                                                {resultado.matches.slice(0, 3).map((match, idx) => (
                                                                    <div key={idx} className="text-xs flex justify-between items-center p-2 bg-white rounded">
                                                                        <span>{match.descripcion} ({Math.round(match.score * 100)}%)</span>
                                                                        <button 
                                                                            onClick={async () => {
                                                                                if (await confirmModal(`¿Conciliar con ${match.descripcion}?`)) {
                                                                                    aplicarConciliacion(mov.id, match.tipo, match.id);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 bg-gray-600 text-white rounded text-xs"
                                                                        >
                                                                            Aplicar
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    
                                                    {/* Sugerencia para entradas sin match */}
                                                    {mov.tipo === 'entrada' && (!resultado.matches || resultado.matches.length === 0 || resultado.matches[0].score < 0.60) && (
                                                        <div className="bg-green-50 p-3 rounded mb-2">
                                                            <div className="text-sm font-medium text-green-700 mb-1">
                                                                💡 Depósito sin factura registrada
                                                            </div>
                                                            <div className="text-sm text-gray-600 mb-2">
                                                                Crea una factura emitida y concilia automáticamente
                                                            </div>
                                                            <button 
                                                                onClick={() => showToast('Próximamente: crear factura emitida prellenada', 'info')}
                                                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                                            >
                                                                ✏️ Crear Factura
                                                            </button>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Acciones */}
                                                    <div className="flex gap-2 pt-2 border-t flex-wrap">
                                                        {/* Para salidas: siempre permitir crear gasto o factura recibida */}
                                                        {mov.tipo === 'salida' && (
                                                            <>
                                                                <button 
                                                                    onClick={async () => {
                                                                        const categoria = resultado.sugerenciaCategoria || 'Otros';
                                                                        if (await confirmModal(`¿Crear gasto en Caja Chica como "${categoria}"?`)) {
                                                                            crearGastoCajaChica(mov, categoria);
                                                                        }
                                                                    }}
                                                                    className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                                                                >
                                                                    + Gasto
                                                                </button>
                                                                <button 
                                                                    onClick={() => showToast('Próximamente: crear factura recibida', 'info')}
                                                                    className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                                                >
                                                                    + Factura Recibida
                                                                </button>
                                                            </>
                                                        )}
                                                        
                                                        {/* Para entradas: siempre permitir crear factura emitida */}
                                                        {mov.tipo === 'entrada' && (
                                                            <button 
                                                                onClick={() => showToast('Próximamente: crear factura emitida', 'info')}
                                                                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                                            >
                                                                + Factura Emitida
                                                            </button>
                                                        )}
                                                        
                                                        <button 
                                                            onClick={() => ignorarMovimiento(mov.id)}
                                                            className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 dark:text-gray-200"
                                                        >
                                                            Ignorar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    
                                    {movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length === 0 && (
                                        <div className="text-center py-8 text-gray-500">
                                            ✅ Todos los movimientos están conciliados o ignorados
                                        </div>
                                    )}
                                </div>
                                
                                {/* Movimientos conciliados */}
                                {movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length > 0 && (
                                    <details className="mt-6">
                                        <summary className="font-medium mb-2 cursor-pointer dark:text-gray-200 hover:text-naranja transition">
                                            ✅ Conciliados ({movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length})
                                        </summary>
                                        <div className="space-y-2 mt-3">
                                            {movBancAct
                                                .filter(m => m.estado_conciliacion === 'conciliado')
                                                .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                                                .map(mov => (
                                                    <div key={mov.id} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm flex justify-between items-center">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                                    {mov.tipo === 'entrada' ? '↑' : '↓'}
                                                                </span>
                                                                <span className="text-gray-500 dark:text-gray-400 text-xs">{mov.fecha}</span>
                                                                <span className="truncate dark:text-gray-300">{mov.descripcion}</span>
                                                            </div>
                                                            {mov.conciliado_con_tipo && (
                                                                <span className="text-[10px] text-gray-400 ml-6">↔ {mov.conciliado_con_tipo}</span>
                                                            )}
                                                        </div>
                                                        <span className="font-medium ml-2 dark:text-gray-200">${mov.monto_clp?.toLocaleString('es-CL')}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </details>
                                )}
                                
                                {/* Movimientos ignorados */}
                                {movBancAct.filter(m => m.estado_conciliacion === 'ignorar').length > 0 && (
                                    <details className="mt-4">
                                        <summary className="font-medium mb-2 cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition text-sm">
                                            🚫 Ignorados ({movBancAct.filter(m => m.estado_conciliacion === 'ignorar').length})
                                        </summary>
                                        <div className="space-y-1 mt-2">
                                            {movBancAct
                                                .filter(m => m.estado_conciliacion === 'ignorar')
                                                .map(mov => (
                                                    <div key={mov.id} className="text-xs text-gray-400 dark:text-gray-500 flex justify-between p-2">
                                                        <span>{mov.fecha} · {mov.descripcion}</span>
                                                        <span>${mov.monto_clp?.toLocaleString('es-CL')}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                        {/* Estado de Resultados */}
                        {contaTab === 'pl' && (() => {
                            const isCLP = monedaPreferida === 'CLP';
                            const uf = ufActual || 38000;
                            const fmtVal = (valUF) => {
                                const rounded = Math.round(valUF * 10) / 10;
                                if (isCLP) return `$${Math.round(valUF * uf).toLocaleString('es-CL')}`;
                                return `${rounded} UF`;
                            };
                            const fmtValBig = (valUF) => {
                                const rounded = Math.round(valUF * 10) / 10;
                                if (isCLP) return `$${Math.round(valUF * uf).toLocaleString('es-CL')}`;
                                return `${rounded} UF`;
                            };
                            const monLabel = isCLP ? 'CLP' : 'UF';

                            // Obtener años disponibles de los datos
                            const añosDisponibles = [...new Set([
                                ...facturasEmitidas.map(f => new Date(f.fecha_emision).getFullYear()),
                                ...facturasRecibidas.map(f => new Date(f.fecha_emision).getFullYear()),
                                ...boletasHonorarios.map(b => new Date(b.fecha).getFullYear()),
                                ...cajaChica.map(c => new Date(c.fecha).getFullYear())
                            ])].sort((a, b) => b - a);
                            
                            if (añosDisponibles.length === 0) {
                                añosDisponibles.push(new Date().getFullYear());
                            }
                            
                            // Generar datos mes a mes del AÑO COMPLETO seleccionado
                            const generarDatosPL = () => {
                                const meses = [];
                                
                                // Enero a Diciembre del año seleccionado
                                for (let mes = 0; mes < 12; mes++) {
                                    const mesNombre = new Date(añoSeleccionado, mes, 1).toLocaleDateString('es-CL', { month: 'short' });
                                    
                                    // Facturas Emitidas del mes (Ingresos - exentas de IVA)
                                    // Excluir facturas "Reclamado" (anuladas por SII)
                                    const emitidas = facturasEmitidas
                                        .filter(f => {
                                            if (f.estado === 'Reclamado' || f.estado === 'Reclamada') return false; // Excluir anuladas
                                            const d = new Date(f.fecha_emision);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0);
                                    
                                    // Facturas Recibidas del mes (Gastos operacionales con IVA incluido)
                                    // Excluir facturas "Reclamado" (anuladas)
                                    const gastos = facturasRecibidas
                                        .filter(f => {
                                            if (f.estado === 'Reclamado' || f.estado === 'Reclamada') return false; // Excluir anuladas
                                            const d = new Date(f.fecha_emision);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0);
                                    
                                    // Boletas de Honorarios del mes (bruto)
                                    const honorarios = boletasHonorarios
                                        .filter(b => {
                                            const d = new Date(b.fecha);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, b) => sum + (parseFloat(b.monto_bruto_uf) || 0), 0);
                                    
                                    // Retiros Socios del mes
                                    const sueldos = sueldosSocios
                                        .filter(s => {
                                            const d = new Date(s.fecha);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, s) => sum + (parseFloat(s.monto_uf) || 0), 0);
                                    
                                    // Retenciones del mes (15.25%)
                                    const retenciones = boletasHonorarios
                                        .filter(b => {
                                            const d = new Date(b.fecha);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, b) => sum + (parseFloat(b.monto_retencion_uf) || 0), 0);
                                    
                                    // Caja Chica del mes (boletas menores)
                                    const cajaChicaCLP = cajaChica
                                        .filter(c => {
                                            const d = new Date(c.fecha);
                                            return d.getMonth() === mes && d.getFullYear() === añoSeleccionado;
                                        })
                                        .reduce((sum, c) => sum + (parseFloat(c.monto_clp) || 0), 0);
                                    const cajaChicaUF = cajaChicaCLP / (ufActual || 38000);
                                    
                                    // Cálculos
                                    const totalGastos = gastos + honorarios + sueldos + cajaChicaUF;
                                    const utilidadOperacional = emitidas - totalGastos;
                                    const utilidadNeta = utilidadOperacional; // Retenciones no son gasto, se pagan al SII
                                    
                                    meses.push({
                                        mes: mesNombre,
                                        emitidas: Math.round(emitidas * 10) / 10,
                                        gastos: Math.round(gastos * 10) / 10,
                                        honorarios: Math.round(honorarios * 10) / 10,
                                        sueldos: Math.round(sueldos * 10) / 10,
                                        cajaChica: Math.round(cajaChicaUF * 10) / 10,
                                        retenciones: Math.round(retenciones * 10) / 10,
                                        utilidadOperacional: Math.round(utilidadOperacional * 10) / 10,
                                        utilidadNeta: Math.round(utilidadNeta * 10) / 10
                                    });
                                }
                                
                                return meses;
                            };
                            
                            const datosPL = generarDatosPL();
                            const totalEmitidas = datosPL.reduce((sum, m) => sum + m.emitidas, 0);
                            const totalGastos = datosPL.reduce((sum, m) => sum + m.gastos, 0);
                            const totalHonorarios = datosPL.reduce((sum, m) => sum + m.honorarios, 0);
                            const totalSueldos = datosPL.reduce((sum, m) => sum + m.sueldos, 0);
                            const totalCajaChica = datosPL.reduce((sum, m) => sum + m.cajaChica, 0);
                            const totalRetenciones = datosPL.reduce((sum, m) => sum + m.retenciones, 0);
                            const totalGastosConsolidado = totalGastos + totalHonorarios + totalSueldos + totalCajaChica;
                            const utilidadOperacional = totalEmitidas - totalGastosConsolidado;
                            const utilidadNeta = utilidadOperacional;
                            
                            // Proyección de impuestos (estimado 20% para sociedades)
                            const impuestosEstimados = Math.max(0, utilidadNeta * 0.20);
                            const utilidadDespuesImpuestos = utilidadNeta - impuestosEstimados;
                            
                            return (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg dark:text-gray-200">Año Fiscal</h3>
                                        <select 
                                            value={añoSeleccionado} 
                                            onChange={(e) => setAñoSeleccionado(parseInt(e.target.value))}
                                            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 dark:text-gray-200"
                                        >
                                            {añosDisponibles.map(año => (
                                                <option key={año} value={año}>{año}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button onClick={() => {
                                        // Exportar a CSV
                                        const data = generarDatosPL();
                                        const csv = [
                                            ['Mes', 'Ingresos', 'Gastos Operacionales', 'Honorarios', 'Caja Chica', 'Retenciones', 'Utilidad Operacional', 'Utilidad Neta'],
                                            ...data.map(m => [m.mes, m.emitidas, m.gastos, m.honorarios, m.cajaChica, m.retenciones, m.utilidadOperacional, m.utilidadNeta])
                                        ].map(row => row.join(',')).join('\n');
                                        const blob = new Blob([csv], { type: 'text/csv' });
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `estado-resultados-${añoSeleccionado}.csv`;
                                        a.click();
                                    }} className="px-4 py-2 bg-gray-100 rounded-lg text-sm whitespace-nowrap">📥 CSV</button>
                                    <button onClick={() => {
                                        const data = generarDatosPL();
                                        const uf = ufActual || 38000;
                                        
                                        // Header
                                        const rows = [
                                            ['THE HUMAN ORG Ltda.'],
                                            [`Estado de Resultados - Año ${añoSeleccionado}`],
                                            [`Generado: ${new Date().toLocaleDateString('es-CL')} | UF referencia: $${uf.toLocaleString('es-CL')}`],
                                            [],
                                            ['', ...data.map(m => m.mes.toUpperCase()), 'TOTAL AÑO'],
                                            [],
                                            ['INGRESOS'],
                                            ['  Facturación (exento IVA)', ...data.map(m => Math.round((m.emitidas || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.emitidas||0), 0) * uf)],
                                            ['TOTAL INGRESOS', ...data.map(m => Math.round((m.emitidas || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.emitidas||0), 0) * uf)],
                                            [],
                                            ['GASTOS OPERACIONALES'],
                                            ['  Proveedores (+ IVA)', ...data.map(m => Math.round((m.gastos || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.gastos||0), 0) * uf)],
                                            ['  Honorarios (bruto)', ...data.map(m => Math.round((m.honorarios || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.honorarios||0), 0) * uf)],
                                            ['  Retiros Socios', ...data.map(m => Math.round((m.sueldos || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.sueldos||0), 0) * uf)],
                                            ['  Caja Chica (boletas)', ...data.map(m => Math.round((m.cajaChica || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.cajaChica||0), 0) * uf)],
                                            ['TOTAL GASTOS', ...data.map(m => Math.round(((m.gastos||0) + (m.honorarios||0) + (m.sueldos||0) + (m.cajaChica||0)) * uf)), Math.round(data.reduce((s,m) => s + (m.gastos||0) + (m.honorarios||0) + (m.sueldos||0) + (m.cajaChica||0), 0) * uf)],
                                            [],
                                            ['UTILIDAD OPERACIONAL', ...data.map(m => Math.round((m.utilidadOperacional || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.utilidadOperacional||0), 0) * uf)],
                                            [],
                                            ['  Retención Boletas (12,25%)', ...data.map(m => Math.round((m.retenciones || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.retenciones||0), 0) * uf)],
                                            [],
                                            ['UTILIDAD NETA', ...data.map(m => Math.round((m.utilidadNeta || 0) * uf)), Math.round(data.reduce((s,m) => s + (m.utilidadNeta||0), 0) * uf)],
                                        ];
                                        
                                        const wb = XLSX.utils.book_new();
                                        const ws = XLSX.utils.aoa_to_sheet(rows);
                                        
                                        // Column widths
                                        ws['!cols'] = [{ wch: 28 }, ...Array(13).fill({ wch: 14 })];
                                        
                                        // Merge title cells
                                        ws['!merges'] = [
                                            { s: {r:0,c:0}, e: {r:0,c:13} },
                                            { s: {r:1,c:0}, e: {r:1,c:13} },
                                            { s: {r:2,c:0}, e: {r:2,c:13} },
                                        ];
                                        
                                        // Number formatting for CLP
                                        const range = XLSX.utils.decode_range(ws['!ref']);
                                        for (let R = 7; R <= range.e.r; R++) {
                                            for (let C = 1; C <= range.e.c; C++) {
                                                const cell = ws[XLSX.utils.encode_cell({r:R, c:C})];
                                                if (cell && typeof cell.v === 'number') {
                                                    cell.z = '#,##0';
                                                }
                                            }
                                        }
                                        
                                        XLSX.utils.book_append_sheet(wb, ws, `EERR ${añoSeleccionado}`);
                                        XLSX.writeFile(wb, `THO_Estado_Resultados_${añoSeleccionado}.xlsx`);
                                        showToast(`✅ Estado de Resultados ${añoSeleccionado} exportado en CLP`, 'success');
                                    }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm whitespace-nowrap hover:bg-green-700 transition">📊 Excel Profesional</button>
                                </div>
                                
                                {/* Resumen anual */}
                                <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6">
                                    <h4 className="font-bold mb-4 text-lg">📊 Resumen {añoSeleccionado}</h4>
                                    
                                    {/* INGRESOS */}
                                    <div className="mb-4">
                                        <div className="text-sm font-bold text-gray-600 mb-2">💰 INGRESOS</div>
                                        <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded">
                                            <span className="font-medium dark:text-gray-200">Facturas Emitidas (exentas):</span>
                                            <span className="font-bold text-verde">{fmtVal(totalEmitidas)}</span>
                                        </div>
                                    </div>
                                    
                                    {/* GASTOS */}
                                    <div className="mb-4">
                                        <div className="text-sm font-bold text-gray-600 mb-2">📥 GASTOS</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded">
                                                <span className="font-medium dark:text-gray-200">Gastos Operacionales (+ IVA):</span>
                                                <span className="font-bold text-naranja">{fmtVal(totalGastos)}</span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded">
                                                <span className="font-medium dark:text-gray-200">Honorarios (bruto):</span>
                                                <span className="font-bold text-azul">{fmtVal(totalHonorarios)}</span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded">
                                                <span className="font-medium dark:text-gray-200">Caja Chica (boletas):</span>
                                                <span className="font-bold text-fucsia">{fmtVal(totalCajaChica)}</span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded font-bold">
                                                <span>TOTAL GASTOS:</span>
                                                <span className="text-naranja">{fmtVal(totalGastosConsolidado)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* UTILIDAD OPERACIONAL */}
                                    <div className="flex justify-between items-center p-4 bg-white rounded mb-4 border-2">
                                        <span className="text-lg font-bold">📊 UTILIDAD OPERACIONAL:</span>
                                        <span className={`text-2xl font-bold ${utilidadOperacional >= 0 ? 'text-verde' : 'text-red-600'}`}>
                                            {utilidadOperacional >= 0 ? "+" : ""}{fmtVal(utilidadOperacional)}
                                        </span>
                                    </div>
                                    
                                    {/* OBLIGACIONES FISCALES */}
                                    <div className="mb-4">
                                        <div className="text-sm font-bold text-gray-600 mb-2">💸 OBLIGACIONES FISCALES</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div className="flex justify-between p-3 bg-orange-50 dark:bg-orange-900/30 rounded">
                                                <span className="font-medium dark:text-gray-200">Retenciones por pagar (15.25%):</span>
                                                <span className="font-bold text-orange-600">{fmtVal(totalRetenciones)}</span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-purple-50 dark:bg-purple-900/30 rounded">
                                                <span className="font-medium dark:text-gray-200">Impuesto estimado (20%):</span>
                                                <span className="font-bold text-purple-600">{fmtVal(impuestosEstimados)}</span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded font-bold">
                                                <span>TOTAL FISCAL:</span>
                                                <span className="text-orange-600">{fmtVal(totalRetenciones + impuestosEstimados)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* UTILIDAD NETA */}
                                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30 rounded border-2 border-verde">
                                        <span className="text-lg font-bold">🎯 UTILIDAD NETA (después impuestos):</span>
                                        <span className={`text-2xl font-bold ${utilidadDespuesImpuestos >= 0 ? 'text-verde' : 'text-red-600'}`}>
                                            {utilidadDespuesImpuestos >= 0 ? '+' : ''}{fmtVal(utilidadDespuesImpuestos)}
                                        </span>
                                    </div>
                                    
                                    <div className="text-xs text-gray-600 mt-4 text-center">
                                        ℹ️ Impuesto estimado al 20% (consultar con contador para cálculo exacto considerando tramos, gastos rechazados y créditos)
                                    </div>
                                </div>
                                
                                {/* Tabla mes a mes */}
                                <div>
                                <h4 className="font-bold mb-3 dark:text-gray-200">Desglose Mensual</h4>
                                
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y bg-white rounded-lg shadow">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Mes</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">💰 Ingresos</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">📥 Gastos</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">👤 Honorarios</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">💼 Retiros</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">💵 Caja</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">🔶 Retenc.</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">📊 Utilidad</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {datosPL.map((m, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 dark:bg-gray-700">
                                                    <td className="px-4 py-3 text-sm font-medium">{m.mes}</td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.emitidas} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.gastos} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.honorarios} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.sueldos} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.cajaChica} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.retenciones} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                    <td className="px-4 py-3 text-right"><DualCurrency amountUF={m.utilidadNeta} ufValue={ufActual} size="sm" primary={monedaPreferida} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Mobile */}
                                <div className="md:hidden space-y-3">
                                    {datosPL.map((m, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                            <div className="font-bold text-lg mb-3 border-b pb-2">{m.mes}</div>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">💰 Ingresos:</span>
                                                    <span className="font-medium text-verde">{fmtVal(m.emitidas)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">📥 Gastos:</span>
                                                    <span className="font-medium text-naranja">{fmtVal(m.gastos)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">👤 Honorarios:</span>
                                                    <span className="font-medium text-azul">{fmtVal(m.honorarios)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">💼 Retiros:</span>
                                                    <span className="font-medium text-purple-600">{fmtVal(m.sueldos)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">💵 Caja Chica:</span>
                                                    <span className="font-medium text-fucsia">{fmtVal(m.cajaChica)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">🔶 Retenciones:</span>
                                                    <span className="font-medium text-orange-600">{fmtVal(m.retenciones)}</span>
                                                </div>
                                                <div className="flex justify-between pt-2 border-t">
                                                    <span className="font-bold dark:text-gray-200">📊 Utilidad:</span>
                                                    <span className={`font-bold ${m.utilidadNeta >= 0 ? 'text-verde' : 'text-red-600'}`}>
                                                        {m.utilidadNeta >= 0 ? '+' : ''}{fmtVal(m.utilidadNeta)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                            </div>
                            </div>
                            );
                        })()}
                    </div>
                </div>
                
                {/* Modal de contabilidad */}
                {showModal && <ContaModal type={modalType} item={editing} ufActual={ufActual} tickets={tickets} keyAccounts={keyAccounts} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null); }} />}
            </div>
        );
    }
