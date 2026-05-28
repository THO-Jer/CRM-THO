import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'
import { confirmModal } from '../../utils/confirmModal'
import { Chart } from '../../utils/chartSetup'
import * as XLSX from 'xlsx'
import DualCurrency from '../shared/DualCurrency'
import MetricCard from '../shared/MetricCard'
import ContaModal from './ContaModal'
import type { Ticket, KeyAccount } from '../../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FinancialRecord = Record<string, any>
type ChartCanvas = HTMLCanvasElement & { chart?: InstanceType<typeof Chart> | null }
type ContaType = 'emitida' | 'recibida' | 'boleta' | 'sueldo' | 'caja'
type ModalType = ContaType | null

interface DateRange { desde?: string; hasta?: string }
interface AlertaValidacion { tipo: 'error' | 'warning' | 'info'; mensaje: string }
interface MatchResult { matches: FinancialRecord[]; sugerenciaCategoria?: string }
interface DashboardData { datos6Meses: { label: string; ingresos: number; gastos: number }[]; gastosActual: number; honorariosActual: number; cajaActual: number }

interface ContabilidadViewProps {
    facturasEmitidas: FinancialRecord[]
    facturasRecibidas: FinancialRecord[]
    cajaChica: FinancialRecord[]
    boletasHonorarios: FinancialRecord[]
    sueldosSocios: FinancialRecord[]
    movimientosBancarios: FinancialRecord[]
    tickets: Ticket[]
    keyAccounts: KeyAccount[]
    ufActual: number
    contaTab: string
    setContaTab: (tab: string) => void
    monedaPreferida: string
    alertasValidacion: AlertaValidacion[]
    setAlertasValidacion: (a: AlertaValidacion[]) => void
    importarBoletasExcel: () => void
    importarFacturasEmitidasExcel: () => void
    importarFacturasRecibidasExcel: () => void
    importarCartola: () => void
    buscarMatches: (mov: FinancialRecord) => MatchResult
    aplicarConciliacion: (movId: string, tipo: string, id: string) => void
    crearGastoCajaChica: (mov: FinancialRecord, categoria: string) => void
    ignorarMovimiento: (id: string) => void
    onReload: () => void
    onFiles: (tabla: string, id: string, nombre: string) => void
    dateRange?: DateRange | null
}

export default function ContabilidadView({
    facturasEmitidas, facturasRecibidas, cajaChica, boletasHonorarios, sueldosSocios,
    movimientosBancarios, tickets, keyAccounts, ufActual, contaTab, setContaTab,
    monedaPreferida, alertasValidacion, setAlertasValidacion,
    importarBoletasExcel, importarFacturasEmitidasExcel, importarFacturasRecibidasExcel,
    importarCartola, buscarMatches, aplicarConciliacion, crearGastoCajaChica,
    ignorarMovimiento, onReload, onFiles, dateRange
}: ContabilidadViewProps) {
    const dashboardDataRef = useRef<DashboardData | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalType, setModalType] = useState<ModalType>(null)
    const [editing, setEditing] = useState<FinancialRecord | null>(null)
    const [añoSeleccionado, setAñoSeleccionado] = useState(new Date().getFullYear())

    const [periodo, setPeriodo] = useState('mes_actual')
    const [fechaDesdeCustom, setFechaDesdeCustom] = useState('')
    const [fechaHastaCustom, setFechaHastaCustom] = useState('')
    void setPeriodo; void setFechaDesdeCustom; void setFechaHastaCustom

    useEffect(() => {
        if (contaTab !== 'dashboard') return

        const timeout = setTimeout(() => {
            const canvasIG = document.getElementById('chartIngGastos') as ChartCanvas | null
            const canvasD = document.getElementById('chartDonut') as ChartCanvas | null

            if (canvasIG && dashboardDataRef.current) {
                if (canvasIG.chart) { canvasIG.chart.destroy(); canvasIG.chart = null }
                canvasIG.chart = new Chart(canvasIG, {
                    type: 'bar',
                    data: {
                        labels: dashboardDataRef.current.datos6Meses.map(d => d.label),
                        datasets: [
                            { label: 'Ingresos', data: dashboardDataRef.current.datos6Meses.map(d => d.ingresos), backgroundColor: 'rgba(34, 197, 94, 0.7)', borderColor: 'rgb(34, 197, 94)', borderWidth: 1, borderRadius: 4 },
                            { label: 'Gastos', data: dashboardDataRef.current.datos6Meses.map(d => d.gastos), backgroundColor: 'rgba(249, 115, 22, 0.7)', borderColor: 'rgb(249, 115, 22)', borderWidth: 1, borderRadius: 4 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            tooltip: { callbacks: { label: (c: any) => (c.dataset?.label ?? '') + ': ' + c.parsed.y + ' UF' } }
                        },
                        scales: {
                            y: { beginAtZero: true, ticks: { callback: (v: unknown) => v + ' UF', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                            x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                        }
                    }
                })
            }

            if (canvasD && dashboardDataRef.current) {
                if (canvasD.chart) { canvasD.chart.destroy(); canvasD.chart = null }
                const totalG = dashboardDataRef.current.gastosActual + dashboardDataRef.current.honorariosActual + dashboardDataRef.current.cajaActual
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
                            borderWidth: 2, hoverOffset: 6
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '65%',
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (c: { label: string; parsed: number }) => c.label + ': ' + c.parsed + ' UF' } }
                        }
                    }
                })
            }
        }, 100)

        return () => {
            clearTimeout(timeout)
            const canvasIG = document.getElementById('chartIngGastos') as ChartCanvas | null
            const canvasD = document.getElementById('chartDonut') as ChartCanvas | null
            if (canvasIG?.chart) { canvasIG.chart.destroy(); canvasIG.chart = null }
            if (canvasD?.chart) { canvasD.chart.destroy(); canvasD.chart = null }
        }
    }, [contaTab, periodo, fechaDesdeCustom, fechaHastaCustom, dateRange, facturasEmitidas, facturasRecibidas, boletasHonorarios, cajaChica, sueldosSocios])

    const calcularRango = () => {
        const hoy = new Date()
        const y = hoy.getFullYear()
        const m = hoy.getMonth()
        switch (periodo) {
            case 'mes_actual': return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 0) }
            case 'mes_anterior': { const mp = m === 0 ? 11 : m - 1; const yp = m === 0 ? y - 1 : y; return { desde: new Date(yp, mp, 1), hasta: new Date(yp, mp + 1, 0) } }
            case 'trimestre': return { desde: new Date(y, m - 2, 1), hasta: new Date(y, m + 1, 0) }
            case 'semestre': return { desde: new Date(y, m - 5, 1), hasta: new Date(y, m + 1, 0) }
            case 'anual': return { desde: new Date(y, 0, 1), hasta: new Date(y, 11, 31) }
            case 'custom': return {
                desde: fechaDesdeCustom ? new Date(fechaDesdeCustom + 'T00:00:00') : new Date(y, 0, 1),
                hasta: fechaHastaCustom ? new Date(fechaHastaCustom + 'T00:00:00') : new Date(y, 11, 31)
            }
            default: return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 0) }
        }
    }

    const isGlobalEmpty = !dateRange?.desde && !dateRange?.hasta
    const useGlobalDateRange = contaTab !== 'pl' && dateRange?.desde && dateRange?.hasta

    const rango = useGlobalDateRange
        ? { desde: new Date(dateRange!.desde! + 'T00:00:00'), hasta: new Date(dateRange!.hasta! + 'T23:59:59') }
        : isGlobalEmpty && contaTab !== 'pl'
            ? { desde: new Date(2020, 0, 1), hasta: new Date(2099, 11, 31) }
            : calcularRango()

    const estEnRango = (fechaStr: string) => {
        const d = new Date(fechaStr)
        const desde = new Date(rango.desde.getFullYear(), rango.desde.getMonth(), rango.desde.getDate())
        const hasta = new Date(rango.hasta.getFullYear(), rango.hasta.getMonth(), rango.hasta.getDate())
        const valor = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        return valor >= desde && valor <= hasta
    }

    const facturasEmiAct = facturasEmitidas.filter(f => f.estado !== 'Reclamada' && estEnRango(f.fecha_emision))
    const facturasRecAct = facturasRecibidas.filter(f => f.estado !== 'Reclamada' && estEnRango(f.fecha_emision))
    const boletasAct = boletasHonorarios.filter(b => estEnRango(b.fecha))
    const cajaAct = cajaChica.filter(c => estEnRango(c.fecha))
    const movBancAct = movimientosBancarios.filter(m => estEnRango(m.fecha))
    const sueldosAct = sueldosSocios.filter(s => estEnRango(s.fecha))

    const handleSave = async (data: FinancialRecord) => {
        try {
            const table = modalType === 'emitida' ? 'facturas_emitidas' :
                         modalType === 'recibida' ? 'facturas_recibidas' :
                         modalType === 'boleta' ? 'boletas_honorarios' :
                         modalType === 'sueldo' ? 'sueldos_socios' :
                         'caja_chica'
            const cleanedData: FinancialRecord = {}
            for (const [key, value] of Object.entries(data)) {
                if (value === '' && (key.includes('monto') || key.includes('uf_dia') || key.includes('numero'))) {
                    cleanedData[key] = null
                } else {
                    cleanedData[key] = value
                }
            }
            let result
            if (editing) {
                result = await supabase.from(table).update(cleanedData).eq('id', editing.id)
            } else {
                result = await supabase.from(table).insert([cleanedData])
            }
            if (result.error) throw new Error(result.error.message)
            showToast('✅ Guardado exitosamente', 'success')
            setShowModal(false); setEditing(null); onReload()
        } catch (err) {
            showToast('Error al guardar: ' + (err as Error).message, 'error')
        }
    }

    const handleDelete = async (id: string, type: string) => {
        if (!(await confirmModal('¿Eliminar este registro?'))) return
        const table = type === 'emitida' ? 'facturas_emitidas' :
                     type === 'recibida' ? 'facturas_recibidas' :
                     type === 'boleta' ? 'boletas_honorarios' :
                     'caja_chica'
        await supabase.from(table).delete().eq('id', id)
        onReload()
    }

    const totalEmitidas = facturasEmiAct.reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0)
    const totalRecibidas = facturasRecAct.reduce((sum, f) => sum + (parseFloat(f.monto_uf) || 0), 0)
    const totalBoletas = boletasAct.reduce((sum, b) => sum + (parseFloat(b.monto_bruto_uf) || parseFloat(b.monto_uf) || 0), 0)
    const totalCajaChica = cajaAct.reduce((sum, c) => sum + (parseFloat(c.monto_clp) || 0), 0)
    const margen = totalEmitidas - totalRecibidas - totalBoletas - (totalCajaChica / (ufActual || 38000))

    const exportarSueldosExcel = (sueldos: FinancialRecord[], _periodo: string) => {
        const datosExport = sueldos.map(s => ({
            'Socio': s.socio, 'Mes Servicio': s.mes_servicio, 'Fecha': s.fecha,
            'Monto CLP': parseFloat(s.monto_clp) || 0, 'Monto UF': parseFloat(s.monto_uf) || 0,
            'UF Día': parseFloat(s.uf_dia) || ufActual, 'Concepto': s.concepto || ''
        }))
        const totalCLP = datosExport.reduce((sum, s) => sum + s['Monto CLP'], 0)
        const totalUF = datosExport.reduce((sum, s) => sum + s['Monto UF'], 0)
        datosExport.push({ 'Socio': 'TOTAL', 'Mes Servicio': '', 'Fecha': '', 'Monto CLP': totalCLP, 'Monto UF': totalUF, 'UF Día': 0, 'Concepto': '' })
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(datosExport)
        ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 30 }]
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const cellCLP = ws[XLSX.utils.encode_cell({ r: R, c: 3 })]
            if (cellCLP && typeof cellCLP.v === 'number') cellCLP.z = '#,##0'
            const cellUF = ws[XLSX.utils.encode_cell({ r: R, c: 4 })]
            if (cellUF && typeof cellUF.v === 'number') cellUF.z = '#,##0.00'
        }
        XLSX.utils.book_append_sheet(wb, ws, 'Retiros Socios')
        const periodoTexto = (dateRange?.desde || dateRange?.hasta)
            ? `${dateRange?.desde || 'inicio'}_a_${dateRange?.hasta || 'hoy'}`
            : 'Todos'
        const fechaExport = new Date().toISOString().split('T')[0]
        XLSX.writeFile(wb, `THO_Retiros_Socios_${periodoTexto}_${fechaExport}.xlsx`)
        showToast(`✅ Excel exportado`, 'success')
    }

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

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
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
                                <button key={tab.id} onClick={() => setContaTab(tab.id)}
                                    className={`py-3 px-1 border-b-2 font-medium text-xs whitespace-nowrap ${contaTab === tab.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                    {tab.nombre}
                                </button>
                            ))}
                        </nav>
                    </div>
                )}

                <div className="p-6">
                    {/* Dashboard */}
                    {contaTab === 'dashboard' && (() => {
                        const montoUFBoleta = (b: FinancialRecord) => parseFloat(b.monto_bruto_uf) || parseFloat(b.monto_uf) || 0
                        const emitidaActual = facturasEmiAct.reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                        const gastosActual = facturasRecAct.reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                        const honorariosActual = boletasAct.reduce((s, b) => s + montoUFBoleta(b), 0)
                        const retenciones = boletasAct.reduce((s, b) => s + (parseFloat(b.monto_retencion_uf) || 0), 0)
                        const cajaActual = cajaAct.reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000)
                        const flujoNeto = emitidaActual - gastosActual - honorariosActual - cajaActual

                        const largo = rango.hasta.getTime() - rango.desde.getTime()
                        const prevHasta = new Date(rango.desde.getTime() - 1)
                        const prevDesde = new Date(prevHasta.getTime() - largo)
                        const estEnPrev = (fechaStr: string) => {
                            const d = new Date(fechaStr)
                            const v = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                            const pd = new Date(prevDesde.getFullYear(), prevDesde.getMonth(), prevDesde.getDate())
                            const ph = new Date(prevHasta.getFullYear(), prevHasta.getMonth(), prevHasta.getDate())
                            return v >= pd && v <= ph
                        }
                        // Fix: excluir Reclamadas del período anterior (consistente con facturasEmiAct)
                        const emitidaAnterior = facturasEmitidas.filter(f => f.estado !== 'Reclamada' && estEnPrev(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                        // Fix: incluir honorarios y caja en el período anterior para comparar manzanas con manzanas
                        const gastosRecAnt = facturasRecibidas.filter(f => f.estado !== 'Reclamada' && estEnPrev(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                        const honorariosAnt = boletasHonorarios.filter(b => estEnPrev(b.fecha)).reduce((s, b) => s + montoUFBoleta(b), 0)
                        const cajaAnt = cajaChica.filter(c => estEnPrev(c.fecha)).reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000)
                        const gastosAnterior = gastosRecAnt + honorariosAnt + cajaAnt

                        // Fix: respetar rango de fechas para por cobrar/pagar
                        const porCobrar = facturasEmiAct.filter(f => f.estado === 'Pendiente').reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                        const porPagar = facturasRecAct.filter(f => f.estado === 'Pendiente').reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)

                        const datos6Meses = (() => {
                            const result: { label: string; ingresos: number; gastos: number }[] = []
                            const desde = rango.desde
                            const hasta = rango.hasta
                            let y = desde.getFullYear()
                            let m = desde.getMonth()
                            while (new Date(y, m, 1) <= hasta) {
                                const label = new Date(y, m, 1).toLocaleDateString('es-CL', { month: 'short' })
                                const mesDesde = new Date(y, m, 1)
                                const mesHasta = new Date(y, m + 1, 0)
                                const estEnMes = (fechaStr: string) => {
                                    const d = new Date(fechaStr)
                                    const v = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                                    return v >= mesDesde && v <= mesHasta
                                }
                                const ing = facturasEmitidas.filter(f => estEnMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                                const gas = facturasRecibidas.filter(f => estEnMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                                const hon = boletasHonorarios.filter(b => estEnMes(b.fecha)).reduce((s, b) => s + (parseFloat(b.monto_bruto_uf) || parseFloat(b.monto_uf) || 0), 0)
                                const caj = cajaChica.filter(c => estEnMes(c.fecha)).reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000)
                                result.push({ label, ingresos: Math.round(ing), gastos: Math.round(gas + hon + caj) })
                                m++
                                if (m > 11) { m = 0; y++ }
                            }
                            return result
                        })()

                        const totalGastosDonut = gastosActual + honorariosActual + cajaActual

                        const alertas: { tipo: string; msg: string }[] = []
                        if (flujoNeto < 0) alertas.push({ tipo: 'danger', msg: `Flujo neto negativo en el período: ${Math.round(flujoNeto)} UF` })
                        if (porCobrar > 0) alertas.push({ tipo: 'warning', msg: `${Math.round(porCobrar)} UF por cobrar en facturas pendientes` })
                        if (porPagar > 0) alertas.push({ tipo: 'info', msg: `${Math.round(porPagar)} UF por pagar en facturas recibidas` })
                        if (retenciones > 0) alertas.push({ tipo: 'fiscal', msg: `${Math.round(retenciones)} UF en retenciones del período (15.25%)` })

                        const cambioIngresos = emitidaAnterior > 0 ? ((emitidaActual - emitidaAnterior) / emitidaAnterior * 100) : (emitidaActual > 0 ? null : 0)
                        const gastosActualTotal = gastosActual + honorariosActual + cajaActual
                        const cambioGastos = gastosAnterior > 0 ? ((gastosActualTotal - gastosAnterior) / gastosAnterior * 100) : (gastosActualTotal > 0 ? null : 0)

                        dashboardDataRef.current = { datos6Meses, gastosActual, honorariosActual, cajaActual }

                        return (
                            <div className="space-y-6">
                                {alertas.length > 0 && (
                                    <div className="space-y-2">
                                        {alertas.map((a, i) => (
                                            <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                                                a.tipo === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 border border-red-200' :
                                                a.tipo === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                                a.tipo === 'fiscal' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                                'bg-blue-50 text-blue-700 border border-blue-200'
                                            }`}>
                                                <span>{a.tipo === 'danger' ? '🔴' : a.tipo === 'warning' ? '⚠️' : a.tipo === 'fiscal' ? '💸' : 'ℹ️'}</span>
                                                <span>{a.msg}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

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
                                        <div className="text-xs text-gray-400 mt-1">Ingresos - Gastos</div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">💸 Retenciones</div>
                                        <DualCurrency amountUF={Math.round(retenciones)} ufValue={ufActual} size="lg" primary={monedaPreferida} />
                                        <div className="text-xs text-gray-400 mt-1">Por pagar al SII</div>
                                    </div>
                                </div>

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

                                {alertasValidacion.length > 0 && (
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-xl p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-bold text-yellow-800">⚠️ Alertas de Validación</h4>
                                            <button onClick={() => setAlertasValidacion([])} className="text-yellow-600 hover:text-yellow-800 text-sm">✕ Cerrar</button>
                                        </div>
                                        <div className="space-y-2">
                                            {alertasValidacion.map((alerta, idx) => (
                                                <div key={idx} className={`text-sm p-2 rounded ${alerta.tipo === 'error' ? 'bg-red-100 text-red-800' : alerta.tipo === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                                                    {alerta.mensaje}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    <div className="lg:col-span-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <h4 className="font-bold text-sm mb-3">📈 Ingresos vs Gastos ({datos6Meses.length} {datos6Meses.length === 1 ? 'mes' : 'meses'})</h4>
                                        <div style={{ height: '220px', position: 'relative' }}><canvas id="chartIngGastos"></canvas></div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                        <h4 className="font-bold text-sm mb-3">🥧 Composición Gastos</h4>
                                        <div style={{ height: '220px', position: 'relative' }}><canvas id="chartDonut"></canvas></div>
                                        <div className="mt-3 space-y-1 text-xs">
                                            <div className="flex justify-between items-center"><div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-400"></span> Operacionales</div><span className="font-medium">{totalGastosDonut > 0 ? Math.round(gastosActual / totalGastosDonut * 100) : 0}%</span></div>
                                            <div className="flex justify-between items-center"><div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-400"></span> Honorarios</div><span className="font-medium">{totalGastosDonut > 0 ? Math.round(honorariosActual / totalGastosDonut * 100) : 0}%</span></div>
                                            <div className="flex justify-between items-center"><div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-purple-400"></span> Caja Chica</div><span className="font-medium">{totalGastosDonut > 0 ? Math.round(cajaActual / totalGastosDonut * 100) : 0}%</span></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl p-4">
                                    <h4 className="font-bold text-sm mb-3">⚡ Acciones Rápidas</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <button onClick={() => { setContaTab('emitidas'); setEditing(null); setModalType('emitida'); setShowModal(true) }} className="flex flex-col items-center gap-1 p-3 bg-green-50 hover:bg-green-100 rounded-lg transition"><span className="text-xl">📤</span><span className="text-xs font-medium text-green-700">Nueva Factura</span></button>
                                        <button onClick={() => { setContaTab('recibidas'); setEditing(null); setModalType('recibida'); setShowModal(true) }} className="flex flex-col items-center gap-1 p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition"><span className="text-xl">📥</span><span className="text-xs font-medium text-orange-700">Nuevo Gasto</span></button>
                                        <button onClick={() => { setContaTab('boletas'); setEditing(null); setModalType('boleta'); setShowModal(true) }} className="flex flex-col items-center gap-1 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition"><span className="text-xl">👤</span><span className="text-xs font-medium text-blue-700">Boleta Honor.</span></button>
                                        <button onClick={() => { setContaTab('caja'); setEditing(null); setModalType('caja'); setShowModal(true) }} className="flex flex-col items-center gap-1 p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition"><span className="text-xl">💵</span><span className="text-xs font-medium text-purple-700">Caja Chica</span></button>
                                    </div>
                                </div>
                            </div>
                        )
                    })()}

                    {/* Facturas Emitidas */}
                    {contaTab === 'emitidas' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold dark:text-gray-200">Facturas Emitidas</h3>
                                <div className="flex gap-2">
                                    <button onClick={importarFacturasEmitidasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">📄 Importar Excel</button>
                                    <button onClick={() => { setEditing(null); setModalType('emitida'); setShowModal(true) }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva</button>
                                </div>
                            </div>
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
                                            <tr><td colSpan={7} className="px-4 py-4 text-center text-sm text-gray-500">Sin facturas emitidas</td></tr>
                                        ) : facturasEmiAct.map(f => (
                                            <tr key={f.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                <td className="px-2 py-3 text-center">
                                                    <input type="checkbox" checked={f.estado === 'Pagada'} onChange={async () => {
                                                        const nuevoEstado = f.estado === 'Pagada' ? 'Pendiente' : 'Pagada'
                                                        const result = await supabase.from('facturas_emitidas').update({ estado: nuevoEstado, fecha_pago: nuevoEstado === 'Pagada' ? new Date().toISOString().split('T')[0] : null }).eq('id', f.id)
                                                        if (!result.error) onReload()
                                                    }} className="w-4 h-4 text-verde cursor-pointer" />
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium">{f.numero_factura}</td>
                                                <td className="px-4 py-3 text-sm">{f.cliente}</td>
                                                <td className="px-4 py-3 text-sm">{f.fecha_emision}</td>
                                                <td className="px-4 py-3"><DualCurrency amountUF={f.monto_uf} amountCLP={f.monto_clp} ufValue={f.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : f.estado === 'Vencida' ? 'bg-red-100 text-red-800' : f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' : 'bg-yellow-100 text-yellow-800'}`}>{f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span></td>
                                                <td className="px-4 py-3 text-right space-x-2">
                                                    {f.estado !== 'Reclamada' && (
                                                        <button onClick={async () => { if (await confirmModal(`¿Anular factura #${f.numero_factura}?`)) { const r = await supabase.from('facturas_emitidas').update({ estado: 'Reclamada' }).eq('id', f.id); if (!r.error) onReload() } }} className="text-gray-500 text-sm hover:text-red-600">❌</button>
                                                    )}
                                                    <button onClick={() => { setEditing(f); setModalType('emitida'); setShowModal(true) }} className="text-azul text-sm">Editar</button>
                                                    <button onClick={() => onFiles('facturas_emitidas', f.id, `Factura ${f.numero_factura}`)} className="text-gray-700 text-sm">📎</button>
                                                    <button onClick={() => handleDelete(f.id, 'emitida')} className="text-red-600 text-sm">Eliminar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden space-y-3">
                                {facturasEmiAct.map(f => (
                                    <div key={f.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div><div className="font-bold dark:text-gray-200">{f.numero_factura}</div><div className="text-sm text-gray-600">{f.cliente}</div></div>
                                            <span className={`px-2 py-1 text-xs rounded-full ${f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : f.estado === 'Vencida' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{f.estado}</span>
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t">
                                            <button onClick={() => { setEditing(f); setModalType('emitida'); setShowModal(true) }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
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
                                    <button onClick={importarFacturasRecibidasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">📄 Importar Excel</button>
                                    <button onClick={() => { setEditing(null); setModalType('recibida'); setShowModal(true) }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva</button>
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
                                            <tr><td colSpan={7} className="px-4 py-4 text-center text-sm text-gray-500">Sin facturas recibidas</td></tr>
                                        ) : facturasRecAct.map(f => (
                                            <tr key={f.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                <td className="px-2 py-3 text-center">
                                                    <input type="checkbox" checked={f.estado === 'Pagada'} onChange={async () => {
                                                        const nuevoEstado = f.estado === 'Pagada' ? 'Pendiente' : 'Pagada'
                                                        const result = await supabase.from('facturas_recibidas').update({ estado: nuevoEstado, fecha_pago: nuevoEstado === 'Pagada' ? new Date().toISOString().split('T')[0] : null }).eq('id', f.id)
                                                        if (!result.error) onReload()
                                                    }} className="w-4 h-4 text-verde cursor-pointer" />
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium">{f.proveedor}</td>
                                                <td className="px-4 py-3 text-sm">{f.categoria}</td>
                                                <td className="px-4 py-3 text-sm">{f.fecha_emision}</td>
                                                <td className="px-4 py-3"><DualCurrency amountUF={f.monto_uf} amountCLP={f.monto_clp} ufValue={f.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 text-xs rounded-full ${f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : f.estado === 'Reclamada' ? 'bg-gray-200 text-gray-600 line-through' : 'bg-yellow-100 text-yellow-800'}`}>{f.estado === 'Reclamada' ? '❌ Anulada' : f.estado}</span></td>
                                                <td className="px-4 py-3 text-right space-x-2">
                                                    {f.estado !== 'Reclamada' && (
                                                        <button onClick={async () => { if (await confirmModal(`¿Anular factura de ${f.proveedor}?`)) { const r = await supabase.from('facturas_recibidas').update({ estado: 'Reclamada' }).eq('id', f.id); if (!r.error) onReload() } }} className="text-gray-500 text-sm hover:text-red-600">❌</button>
                                                    )}
                                                    <button onClick={() => { setEditing(f); setModalType('recibida'); setShowModal(true) }} className="text-azul text-sm">Editar</button>
                                                    <button onClick={() => onFiles('facturas_recibidas', f.id, `${f.proveedor} - ${f.categoria}`)} className="text-gray-700 text-sm">📎</button>
                                                    <button onClick={() => handleDelete(f.id, 'recibida')} className="text-red-600 text-sm">Eliminar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden space-y-3">
                                {facturasRecAct.map(f => (
                                    <div key={f.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div><div className="font-bold dark:text-gray-200">{f.proveedor}</div><div className="text-sm text-gray-600">{f.categoria}</div></div>
                                            <span className={`px-2 py-1 text-xs rounded-full ${f.estado === 'Pagada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{f.estado}</span>
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t">
                                            <button onClick={() => { setEditing(f); setModalType('recibida'); setShowModal(true) }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
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
                                <div className="flex gap-2">
                                    <button onClick={() => exportarSueldosExcel(sueldosAct, 'periodo')} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">📊 Exportar Excel</button>
                                    <button onClick={() => { setEditing(null); setModalType('sueldo'); setShowModal(true) }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nuevo Retiro</button>
                                </div>
                            </div>
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
                                            <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-4">Sin retiros en el período</td></tr>
                                        ) : sueldosAct.map(s => (
                                            <tr key={s.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                <td className="px-4 py-3 text-sm font-medium">{s.socio}</td>
                                                <td className="px-4 py-3 text-sm">{s.mes_servicio}</td>
                                                <td className="px-4 py-3 text-sm">{s.fecha}</td>
                                                <td className="px-4 py-3"><DualCurrency amountUF={s.monto_uf} amountCLP={s.monto_clp} ufValue={s.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                <td className="px-4 py-3 text-sm">{s.concepto}</td>
                                                <td className="px-4 py-3 text-right space-x-2">
                                                    <button onClick={() => { setEditing(s); setModalType('sueldo'); setShowModal(true) }} className="text-azul text-sm">Editar</button>
                                                    <button onClick={() => onFiles('sueldos_socios', s.id, `Retiro ${s.socio} ${s.mes_servicio}`)} className="text-gray-700 text-sm">📎</button>
                                                    <button onClick={async () => { if (await confirmModal('¿Eliminar este retiro?')) { await supabase.from('sueldos_socios').delete().eq('id', s.id); onReload() } }} className="text-red-600 text-sm">Eliminar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden space-y-3">
                                {sueldosAct.map(s => (
                                    <div key={s.id} className="border rounded-lg p-4">
                                        <div className="font-bold dark:text-gray-200">{s.socio} · {s.mes_servicio}</div>
                                        <div className="flex gap-2 pt-2 border-t mt-2">
                                            <button onClick={() => { setEditing(s); setModalType('sueldo'); setShowModal(true) }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
                                            <button onClick={() => onFiles('sueldos_socios', s.id, `Retiro ${s.socio}`)} className="px-3 py-2 text-sm bg-gray-50 rounded">📎</button>
                                            <button onClick={async () => { if (await confirmModal('¿Eliminar?')) { await supabase.from('sueldos_socios').delete().eq('id', s.id); onReload() } }} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">🗑️</button>
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
                                <div className="flex gap-2">
                                    <button onClick={() => { setContaTab('conciliacion'); importarCartola() }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">🏦 Importar Cartola</button>
                                    <button onClick={() => { setEditing(null); setModalType('caja'); setShowModal(true) }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nuevo Gasto</button>
                                </div>
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
                                            <tr><td colSpan={6} className="px-4 py-4 text-center text-sm text-gray-500">Sin gastos de caja chica</td></tr>
                                        ) : cajaAct.map(c => (
                                            <tr key={c.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                <td className="px-4 py-3 text-sm">{c.fecha}</td>
                                                <td className="px-4 py-3 text-sm font-medium">{c.concepto}</td>
                                                <td className="px-4 py-3 text-sm">{c.categoria}</td>
                                                <td className="px-4 py-3 text-sm font-medium">${Math.round(c.monto_clp).toLocaleString('es-CL')}</td>
                                                <td className="px-4 py-3 text-sm">{c.responsable}</td>
                                                <td className="px-4 py-3 text-right space-x-2">
                                                    <button onClick={() => { setEditing(c); setModalType('caja'); setShowModal(true) }} className="text-azul text-sm">Editar</button>
                                                    <button onClick={() => onFiles('caja_chica', c.id, c.concepto)} className="text-gray-700 text-sm">📎</button>
                                                    <button onClick={() => handleDelete(c.id, 'caja')} className="text-red-600 text-sm">Eliminar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden space-y-3">
                                {cajaAct.map(c => (
                                    <div key={c.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between"><div className="font-bold dark:text-gray-200">{c.concepto}</div><span className="font-medium text-verde">${Math.round(c.monto_clp).toLocaleString('es-CL')}</span></div>
                                        <div className="flex gap-2 pt-2 border-t mt-2">
                                            <button onClick={() => { setEditing(c); setModalType('caja'); setShowModal(true) }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
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
                                    <button onClick={importarBoletasExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">📄 Importar Excel</button>
                                    <button onClick={() => { setEditing(null); setModalType('boleta'); setShowModal(true) }} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">+ Nueva Boleta</button>
                                </div>
                            </div>
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
                                            <tr><td colSpan={7} className="px-4 py-4 text-center text-sm text-gray-500">Sin boletas de honorarios</td></tr>
                                        ) : boletasAct.map(b => (
                                            <tr key={b.id} className="hover:bg-gray-50 dark:bg-gray-700">
                                                <td className="px-4 py-3 text-sm font-medium">{b.prestador}</td>
                                                <td className="px-4 py-3 text-sm">{b.mes_servicio}</td>
                                                <td className="px-4 py-3 text-sm">{b.fecha}</td>
                                                <td className="px-4 py-3"><DualCurrency amountUF={b.monto_bruto_uf} amountCLP={b.monto_bruto_clp} ufValue={b.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                <td className="px-4 py-3 text-sm text-naranja">-{monedaPreferida === 'UF' ? `${b.monto_retencion_uf} UF` : `$${Math.round(b.monto_retencion_clp || 0).toLocaleString('es-CL')}`} ({b.porcentaje_retencion}%)</td>
                                                <td className="px-4 py-3"><DualCurrency amountUF={b.monto_liquido_uf} amountCLP={b.monto_liquido_clp} ufValue={b.uf_dia || ufActual} size="sm" primary={monedaPreferida} /></td>
                                                <td className="px-4 py-3 text-right space-x-2">
                                                    <button onClick={() => { setEditing(b); setModalType('boleta'); setShowModal(true) }} className="text-azul text-sm">Editar</button>
                                                    <button onClick={() => onFiles('boletas_honorarios', b.id, `${b.prestador} - ${b.mes_servicio}`)} className="text-gray-700 text-sm">📎</button>
                                                    <button onClick={() => handleDelete(b.id, 'boleta')} className="text-red-600 text-sm">Eliminar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden space-y-3">
                                {boletasAct.map(b => (
                                    <div key={b.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between"><div><div className="font-bold dark:text-gray-200">{b.prestador}</div><div className="text-sm text-gray-600">{b.mes_servicio}</div></div><span className="text-sm font-medium text-verde">{b.monto_liquido_uf} UF</span></div>
                                        <div className="flex gap-2 pt-2 border-t mt-2">
                                            <button onClick={() => { setEditing(b); setModalType('boleta'); setShowModal(true) }} className="flex-1 px-3 py-2 text-sm bg-blue-50 text-azul rounded">Editar</button>
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
                                <span className="text-sm text-gray-500">{movBancAct.length} movimientos · {movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length} pendientes</span>
                                <div className="flex gap-2">
                                    <button onClick={async () => {
                                        if (!(await confirmModal(`⚠️ ESTO ELIMINA TODOS los movimientos bancarios. No se puede deshacer.`, { title: 'Confirmar eliminación masiva', danger: true, confirmLabel: 'Continuar' }))) return
                                        const verificacion = window.prompt('Para confirmar, escribe ELIMINAR (en mayúsculas):')
                                        if (verificacion !== 'ELIMINAR') { showToast('Operación cancelada', 'info'); return }
                                        const { error } = await supabase.from('movimientos_bancarios').delete().neq('id', '00000000-0000-0000-0000-000000000000')
                                        if (error) showToast('Error: ' + error.message, 'error')
                                        else { showToast('✅ Movimientos eliminados', 'success'); onReload() }
                                    }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">🗑️ Limpiar Todo</button>
                                    <button onClick={importarCartola} className="px-4 py-2 color-naranja text-white rounded-lg text-sm">📤 Importar Cartola</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700"><div className="text-sm text-gray-600">⏳ Pendientes por Revisar</div><div className="text-2xl font-bold text-orange-600">{movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length}</div></div>
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700"><div className="text-sm text-gray-600">✅ Conciliados</div><div className="text-2xl font-bold text-verde">{movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length}</div></div>
                            </div>
                            <div className="space-y-3">
                                {movBancAct.filter(m => m.estado_conciliacion === 'pendiente').map(mov => {
                                    const resultado = buscarMatches(mov)
                                    const mejorMatch = resultado.matches[0]
                                    return (
                                        <div key={mov.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 rounded text-xs ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{mov.tipo === 'entrada' ? '📈 Entrada' : '📉 Salida'}</span>
                                                        <span className="text-sm text-gray-600">{mov.fecha}</span>
                                                    </div>
                                                    <div className="font-medium mt-1">{mov.descripcion}</div>
                                                    <div className="text-lg font-bold mt-1"><DualCurrency amountUF={mov.monto_uf} ufValue={mov.uf_dia} size="md" primary={monedaPreferida} /></div>
                                                </div>
                                            </div>
                                            {mejorMatch && mejorMatch.score >= 0.60 ? (
                                                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-2">
                                                    <div className="text-sm font-medium text-azul mb-1">✨ Match sugerido ({Math.round(mejorMatch.score * 100)}% confianza)</div>
                                                    <div className="text-sm">{mejorMatch.descripcion}</div>
                                                    <div className="text-sm text-gray-600">${mejorMatch.monto_clp?.toLocaleString('es-CL')}</div>
                                                    <button onClick={async () => { if (await confirmModal(`¿Conciliar con ${mejorMatch.descripcion}?`)) { aplicarConciliacion(mov.id, mejorMatch.tipo, mejorMatch.id) } }} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium">✓ Aplicar Match</button>
                                                    {resultado.matches.length > 1 && (
                                                        <details className="mt-2"><summary className="text-xs text-gray-600 cursor-pointer">Ver otras opciones ({resultado.matches.length - 1})</summary>
                                                            <div className="mt-2 space-y-1">
                                                                {resultado.matches.slice(1, 4).map((match, idx) => (
                                                                    <div key={idx} className="text-xs flex justify-between items-center p-2 bg-white rounded">
                                                                        <span>{match.descripcion} ({Math.round(match.score * 100)}%)</span>
                                                                        <button onClick={async () => { if (await confirmModal(`¿Conciliar con ${match.descripcion}?`)) { aplicarConciliacion(mov.id, match.tipo, match.id) } }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Aplicar</button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            ) : resultado.sugerenciaCategoria ? (
                                                <div className="bg-yellow-50 p-3 rounded mb-2">
                                                    <div className="text-sm font-medium text-yellow-700 mb-1">💡 Sugerencia: Crear en Caja Chica</div>
                                                    <div className="text-sm">Categoría sugerida: {resultado.sugerenciaCategoria}</div>
                                                    <button onClick={async () => { if (await confirmModal(`¿Crear gasto en Caja Chica como "${resultado.sugerenciaCategoria}"?`)) { crearGastoCajaChica(mov, resultado.sugerenciaCategoria!) } }} className="mt-2 px-3 py-1 bg-orange-600 text-white rounded text-sm">+ Crear Gasto</button>
                                                </div>
                                            ) : resultado.matches.length > 0 ? (
                                                <div className="bg-gray-50 p-3 rounded mb-2">
                                                    <div className="text-sm font-medium text-gray-700 mb-2">Posibles matches (baja confianza):</div>
                                                    <div className="space-y-1">
                                                        {resultado.matches.slice(0, 3).map((match, idx) => (
                                                            <div key={idx} className="text-xs flex justify-between items-center p-2 bg-white rounded">
                                                                <span>{match.descripcion} ({Math.round(match.score * 100)}%)</span>
                                                                <button onClick={async () => { if (await confirmModal(`¿Conciliar con ${match.descripcion}?`)) { aplicarConciliacion(mov.id, match.tipo, match.id) } }} className="px-2 py-1 bg-gray-600 text-white rounded text-xs">Aplicar</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {mov.tipo === 'entrada' && (!resultado.matches || resultado.matches.length === 0 || resultado.matches[0].score < 0.60) && (
                                                <div className="bg-green-50 p-3 rounded mb-2">
                                                    <div className="text-sm font-medium text-green-700 mb-1">💡 Depósito sin factura registrada</div>
                                                    <button onClick={() => showToast('Próximamente: crear factura emitida prellenada', 'info')} className="px-3 py-1 bg-green-600 text-white rounded text-sm">✏️ Crear Factura</button>
                                                </div>
                                            )}
                                            <div className="flex gap-2 pt-2 border-t flex-wrap">
                                                {mov.tipo === 'salida' && (<>
                                                    <button onClick={async () => { const cat = resultado.sugerenciaCategoria || 'Otros'; if (await confirmModal(`¿Crear gasto en Caja Chica como "${cat}"?`)) { crearGastoCajaChica(mov, cat) } }} className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">+ Gasto</button>
                                                    <button onClick={() => showToast('Próximamente: crear factura recibida', 'info')} className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">+ Factura Recibida</button>
                                                </>)}
                                                {mov.tipo === 'entrada' && (<button onClick={() => showToast('Próximamente: crear factura emitida', 'info')} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">+ Factura Emitida</button>)}
                                                <button onClick={() => ignorarMovimiento(mov.id)} className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800">Ignorar</button>
                                            </div>
                                        </div>
                                    )
                                })}
                                {movBancAct.filter(m => m.estado_conciliacion === 'pendiente').length === 0 && (
                                    <div className="text-center py-8 text-gray-500">✅ Todos los movimientos están conciliados o ignorados</div>
                                )}
                            </div>
                            {movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length > 0 && (
                                <details className="mt-6">
                                    <summary className="font-medium mb-2 cursor-pointer dark:text-gray-200">✅ Conciliados ({movBancAct.filter(m => m.estado_conciliacion === 'conciliado').length})</summary>
                                    <div className="space-y-2 mt-3">
                                        {movBancAct.filter(m => m.estado_conciliacion === 'conciliado').sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map(mov => (
                                            <div key={mov.id} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm flex justify-between items-center">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{mov.tipo === 'entrada' ? '↑' : '↓'}</span>
                                                        <span className="text-gray-500 text-xs">{mov.fecha}</span>
                                                        <span className="truncate dark:text-gray-300">{mov.descripcion}</span>
                                                    </div>
                                                    {mov.conciliado_con_tipo && <span className="text-[10px] text-gray-400 ml-6">↔ {mov.conciliado_con_tipo}</span>}
                                                </div>
                                                <span className="font-medium ml-2 dark:text-gray-200">${mov.monto_clp?.toLocaleString('es-CL')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                            {movBancAct.filter(m => m.estado_conciliacion === 'ignorar').length > 0 && (
                                <details className="mt-4">
                                    <summary className="font-medium mb-2 cursor-pointer text-gray-400 text-sm">🚫 Ignorados ({movBancAct.filter(m => m.estado_conciliacion === 'ignorar').length})</summary>
                                    <div className="space-y-1 mt-2">
                                        {movBancAct.filter(m => m.estado_conciliacion === 'ignorar').map(mov => (
                                            <div key={mov.id} className="text-xs text-gray-400 flex justify-between p-2">
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
                        const isCLP = monedaPreferida === 'CLP'
                        const uf = ufActual || 38000
                        const fmtVal = (valUF: number) => isCLP ? `$${Math.round(valUF * uf).toLocaleString('es-CL')}` : `${Math.round(valUF * 10) / 10} UF`

                        const añosDisponibles = [...new Set([
                            ...facturasEmitidas.map(f => new Date(f.fecha_emision).getFullYear()),
                            ...facturasRecibidas.map(f => new Date(f.fecha_emision).getFullYear()),
                            ...boletasHonorarios.map(b => new Date(b.fecha).getFullYear()),
                            ...cajaChica.map(c => new Date(c.fecha).getFullYear())
                        ])].sort((a, b) => b - a)
                        if (añosDisponibles.length === 0) añosDisponibles.push(new Date().getFullYear())

                        const generarDatosPL = () => {
                            const meses = []
                            for (let mes = 0; mes < 12; mes++) {
                                const mesNombre = new Date(añoSeleccionado, mes, 1).toLocaleDateString('es-CL', { month: 'short' })
                                const inMes = (fechaStr: string) => { const d = new Date(fechaStr); return d.getMonth() === mes && d.getFullYear() === añoSeleccionado }
                                const emitidas = facturasEmitidas.filter(f => f.estado !== 'Reclamada' && inMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                                const gastos = facturasRecibidas.filter(f => f.estado !== 'Reclamada' && inMes(f.fecha_emision)).reduce((s, f) => s + (parseFloat(f.monto_uf) || 0), 0)
                                const honorarios = boletasHonorarios.filter(b => inMes(b.fecha)).reduce((s, b) => s + (parseFloat(b.monto_bruto_uf) || parseFloat(b.monto_uf) || 0), 0)
                                const sueldos = sueldosSocios.filter(s => inMes(s.fecha)).reduce((s, sv) => s + (parseFloat(sv.monto_uf) || 0), 0)
                                const retenciones = boletasHonorarios.filter(b => inMes(b.fecha)).reduce((s, b) => s + (parseFloat(b.monto_retencion_uf) || 0), 0)
                                const cajaChicaUF = cajaChica.filter(c => inMes(c.fecha)).reduce((s, c) => s + (parseFloat(c.monto_clp) || 0), 0) / (ufActual || 38000)
                                const totalGastos = gastos + honorarios + sueldos + cajaChicaUF
                                const utilidadOperacional = emitidas - totalGastos
                                meses.push({ mes: mesNombre, emitidas: Math.round(emitidas * 10) / 10, gastos: Math.round(gastos * 10) / 10, honorarios: Math.round(honorarios * 10) / 10, sueldos: Math.round(sueldos * 10) / 10, cajaChica: Math.round(cajaChicaUF * 10) / 10, retenciones: Math.round(retenciones * 10) / 10, utilidadOperacional: Math.round(utilidadOperacional * 10) / 10, utilidadNeta: Math.round(utilidadOperacional * 10) / 10 })
                            }
                            return meses
                        }
                        const datosPL = generarDatosPL()
                        const totEmitidas = datosPL.reduce((s, m) => s + m.emitidas, 0)
                        const totGastos = datosPL.reduce((s, m) => s + m.gastos, 0)
                        const totHonorarios = datosPL.reduce((s, m) => s + m.honorarios, 0)
                        const totSueldos = datosPL.reduce((s, m) => s + m.sueldos, 0)
                        const totCaja = datosPL.reduce((s, m) => s + m.cajaChica, 0)
                        const totRetenciones = datosPL.reduce((s, m) => s + m.retenciones, 0)
                        const totGastosConsolidado = totGastos + totHonorarios + totSueldos + totCaja
                        const utilidadOp = totEmitidas - totGastosConsolidado
                        const impuestosEstimados = Math.max(0, utilidadOp * 0.20)
                        const utilidadDespuesImpuestos = utilidadOp - impuestosEstimados

                        return (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg dark:text-gray-200">Año Fiscal</h3>
                                        <select value={añoSeleccionado} onChange={(e) => setAñoSeleccionado(parseInt(e.target.value))} className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-200">
                                            {añosDisponibles.map(año => <option key={año} value={año}>{año}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => {
                                        const data = generarDatosPL()
                                        const csv = [['Mes', 'Ingresos', 'Gastos', 'Honorarios', 'Caja Chica', 'Retenciones', 'Utilidad'], ...data.map(m => [m.mes, m.emitidas, m.gastos, m.honorarios, m.cajaChica, m.retenciones, m.utilidadNeta])].map(r => r.join(',')).join('\n')
                                        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                                        const url = window.URL.createObjectURL(blob)
                                        const a = document.createElement('a'); a.href = url; a.download = `estado-resultados-${añoSeleccionado}.csv`; a.click()
                                    }} className="px-4 py-2 bg-gray-100 rounded-lg text-sm whitespace-nowrap">📥 CSV</button>
                                    <button onClick={() => {
                                        const data = generarDatosPL()
                                        const rows = [
                                            ['THE HUMAN ORG Ltda.'], [`Estado de Resultados - Año ${añoSeleccionado}`], [`Generado: ${new Date().toLocaleDateString('es-CL')} | UF referencia: $${uf.toLocaleString('es-CL')}`], [],
                                            ['', ...data.map(m => m.mes.toUpperCase()), 'TOTAL AÑO'], [],
                                            ['INGRESOS'],
                                            ['  Facturación (exento IVA)', ...data.map(m => Math.round((m.emitidas || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.emitidas || 0), 0) * uf)],
                                            ['TOTAL INGRESOS', ...data.map(m => Math.round((m.emitidas || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.emitidas || 0), 0) * uf)], [],
                                            ['GASTOS OPERACIONALES'],
                                            ['  Proveedores (+ IVA)', ...data.map(m => Math.round((m.gastos || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.gastos || 0), 0) * uf)],
                                            ['  Honorarios (bruto)', ...data.map(m => Math.round((m.honorarios || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.honorarios || 0), 0) * uf)],
                                            ['  Retiros Socios', ...data.map(m => Math.round((m.sueldos || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.sueldos || 0), 0) * uf)],
                                            ['  Caja Chica', ...data.map(m => Math.round((m.cajaChica || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.cajaChica || 0), 0) * uf)],
                                            ['TOTAL GASTOS', ...data.map(m => Math.round(((m.gastos || 0) + (m.honorarios || 0) + (m.sueldos || 0) + (m.cajaChica || 0)) * uf)), Math.round(data.reduce((s, m) => s + (m.gastos || 0) + (m.honorarios || 0) + (m.sueldos || 0) + (m.cajaChica || 0), 0) * uf)], [],
                                            ['UTILIDAD OPERACIONAL', ...data.map(m => Math.round((m.utilidadOperacional || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.utilidadOperacional || 0), 0) * uf)], [],
                                            ['  Retención Boletas', ...data.map(m => Math.round((m.retenciones || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.retenciones || 0), 0) * uf)], [],
                                            ['UTILIDAD NETA', ...data.map(m => Math.round((m.utilidadNeta || 0) * uf)), Math.round(data.reduce((s, m) => s + (m.utilidadNeta || 0), 0) * uf)],
                                        ]
                                        const wb = XLSX.utils.book_new()
                                        const ws = XLSX.utils.aoa_to_sheet(rows)
                                        ws['!cols'] = [{ wch: 28 }, ...Array(13).fill({ wch: 14 })]
                                        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } }]
                                        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
                                        for (let R = 7; R <= range.e.r; R++) { for (let C = 1; C <= range.e.c; C++) { const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]; if (cell && typeof cell.v === 'number') cell.z = '#,##0' } }
                                        XLSX.utils.book_append_sheet(wb, ws, `EERR ${añoSeleccionado}`)
                                        XLSX.writeFile(wb, `THO_Estado_Resultados_${añoSeleccionado}.xlsx`)
                                        showToast(`✅ Estado de Resultados ${añoSeleccionado} exportado`, 'success')
                                    }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm whitespace-nowrap">📊 Excel Profesional</button>
                                </div>

                                <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6">
                                    <h4 className="font-bold mb-4 text-lg">📊 Resumen {añoSeleccionado}</h4>
                                    <div className="mb-4"><div className="text-sm font-bold text-gray-600 mb-2">💰 INGRESOS</div><div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded"><span className="font-medium">Facturas Emitidas (exentas):</span><span className="font-bold text-verde">{fmtVal(totEmitidas)}</span></div></div>
                                    <div className="mb-4">
                                        <div className="text-sm font-bold text-gray-600 mb-2">📥 GASTOS</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded"><span className="font-medium">Gastos Operacionales (+ IVA):</span><span className="font-bold text-naranja">{fmtVal(totGastos)}</span></div>
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded"><span className="font-medium">Honorarios (bruto):</span><span className="font-bold text-azul">{fmtVal(totHonorarios)}</span></div>
                                            <div className="flex justify-between p-3 bg-white dark:bg-gray-700 rounded"><span className="font-medium">Caja Chica (boletas):</span><span className="font-bold text-fucsia">{fmtVal(totCaja)}</span></div>
                                            <div className="flex justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded font-bold"><span>TOTAL GASTOS:</span><span className="text-naranja">{fmtVal(totGastosConsolidado)}</span></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center p-4 bg-white rounded mb-4 border-2"><span className="text-lg font-bold">📊 UTILIDAD OPERACIONAL:</span><span className={`text-2xl font-bold ${utilidadOp >= 0 ? 'text-verde' : 'text-red-600'}`}>{utilidadOp >= 0 ? '+' : ''}{fmtVal(utilidadOp)}</span></div>
                                    <div className="mb-4">
                                        <div className="text-sm font-bold text-gray-600 mb-2">💸 OBLIGACIONES FISCALES</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div className="flex justify-between p-3 bg-orange-50 rounded"><span className="font-medium">Retenciones por pagar (15.25%):</span><span className="font-bold text-orange-600">{fmtVal(totRetenciones)}</span></div>
                                            <div className="flex justify-between p-3 bg-purple-50 rounded"><span className="font-medium">Impuesto estimado (20%):</span><span className="font-bold text-purple-600">{fmtVal(impuestosEstimados)}</span></div>
                                            <div className="flex justify-between p-3 bg-gray-100 rounded font-bold"><span>TOTAL FISCAL:</span><span className="text-orange-600">{fmtVal(totRetenciones + impuestosEstimados)}</span></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-100 to-blue-100 rounded border-2 border-verde"><span className="text-lg font-bold">🎯 UTILIDAD NETA (después impuestos):</span><span className={`text-2xl font-bold ${utilidadDespuesImpuestos >= 0 ? 'text-verde' : 'text-red-600'}`}>{utilidadDespuesImpuestos >= 0 ? '+' : ''}{fmtVal(utilidadDespuesImpuestos)}</span></div>
                                    <div className="text-xs text-gray-600 mt-4 text-center">ℹ️ Impuesto estimado al 20% (consultar con contador para cálculo exacto)</div>
                                </div>

                                <div>
                                    <h4 className="font-bold mb-3 dark:text-gray-200">Desglose Mensual</h4>
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="min-w-full divide-y bg-white rounded-lg shadow">
                                            <thead className="bg-gray-50 dark:bg-gray-700">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mes</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">💰 Ingresos</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">📥 Gastos</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">👤 Honorarios</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">💼 Retiros</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">💵 Caja</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">🔶 Retenc.</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">📊 Utilidad</th>
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
                                    <div className="md:hidden space-y-3">
                                        {datosPL.map((m, idx) => (
                                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                                <div className="font-bold text-lg mb-3 border-b pb-2">{m.mes}</div>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between"><span className="text-gray-600">💰 Ingresos:</span><span className="font-medium text-verde">{fmtVal(m.emitidas)}</span></div>
                                                    <div className="flex justify-between"><span className="text-gray-600">📥 Gastos:</span><span className="font-medium text-naranja">{fmtVal(m.gastos)}</span></div>
                                                    <div className="flex justify-between"><span className="text-gray-600">👤 Honorarios:</span><span className="font-medium text-azul">{fmtVal(m.honorarios)}</span></div>
                                                    <div className="flex justify-between"><span className="text-gray-600">💼 Retiros:</span><span className="font-medium text-purple-600">{fmtVal(m.sueldos)}</span></div>
                                                    <div className="flex justify-between pt-2 border-t"><span className="font-bold">📊 Utilidad:</span><span className={`font-bold ${m.utilidadNeta >= 0 ? 'text-verde' : 'text-red-600'}`}>{m.utilidadNeta >= 0 ? '+' : ''}{fmtVal(m.utilidadNeta)}</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            </div>

            {showModal && modalType && (
                <ContaModal type={modalType} item={editing} ufActual={ufActual} tickets={tickets} keyAccounts={keyAccounts} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null) }} />
            )}
        </div>
    )
}
