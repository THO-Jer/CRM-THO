import { useMemo, useCallback } from 'react'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../types'
import { clpToUF, todayYMD, diasDesdeHoy } from '../utils/formatters'

// Constantes fuera del hook para evitar recrear arrays/objetos en cada render.
const ESTADOS_KANBAN = [
    { id: 'lead_nuevo',   nombre: 'Lead nuevo',        emoji: '📥' },
    { id: 'contactado',   nombre: 'Contactado',         emoji: '🔵' },
    { id: 'reunion',      nombre: 'Reunión agendada',   emoji: '🟡' },
    { id: 'propuesta',    nombre: 'Propuesta enviada',  emoji: '🟠' },
    { id: 'negociacion',  nombre: 'Negociación',        emoji: '🟢' },
] as const

const ESTADO_TO_KEY: Record<string, string> = {
    'Lead nuevo': 'lead_nuevo', 'Contactado': 'contactado',
    'Reunión agendada': 'reunion', 'Propuesta enviada': 'propuesta', 'Negociación': 'negociacion'
}
const KEY_TO_ESTADO: Record<string, string> = {
    lead_nuevo: 'Lead nuevo', contactado: 'Contactado',
    reunion: 'Reunión agendada', propuesta: 'Propuesta enviada', negociacion: 'Negociación'
}

interface UseMetricsParams {
    prospectos: Prospecto[]
    cerrados: Cerrado[]
    tickets: Ticket[]
    keyAccounts: KeyAccount[]
    ufActual: number
}

export default function useMetrics({ prospectos, cerrados, tickets, keyAccounts, ufActual }: UseMetricsParams) {
    const { metrics, prospectosActivos } = useMemo(() => {
        // Meses comparados por string 'YYYY-MM' en hora LOCAL — new Date('YYYY-MM-DD')
        // parsea a medianoche UTC y corría los cierres del día 1 al mes anterior.
        const hoyStr = todayYMD()
        const mesActualKey = hoyStr.slice(0, 7)
        const [añoNum, mesNum] = [Number(hoyStr.slice(0, 4)), Number(hoyStr.slice(5, 7))]
        const mesAnteriorKey = mesNum === 1
            ? `${añoNum - 1}-12`
            : `${añoNum}-${String(mesNum - 1).padStart(2, '0')}`

        const mesDe = (fecha: string | null | undefined) => String(fecha ?? '').slice(0, 7)
        const cerradosEsteMes = cerrados.filter(c => mesDe(c.fecha_cierre) === mesActualKey)
        const cerradosMesAnterior = cerrados.filter(c => mesDe(c.fecha_cierre) === mesAnteriorKey)
        const ganadosEsteMes = cerradosEsteMes.filter(c => (c as unknown as Record<string, unknown>).estado_final === 'Ganado')
        const ganadosMesAnterior = cerradosMesAnterior.filter(c => (c as unknown as Record<string, unknown>).estado_final === 'Ganado')

        const mrrActual = keyAccounts.filter(ka => (ka.salud || '').toLowerCase() !== 'cerrado').reduce((sum, ka) => sum + (parseFloat(String(ka.uf_mes)) || 0), 0)

        // ufActual ya viene con cache de localStorage (obtenerUFHoy); esto es último recurso
        const ufSeguro = Number(ufActual) > 0 ? Number(ufActual) : 39000
        const valorTickets = tickets.reduce((sum, t) => {
            const tAny = t as unknown as Record<string, unknown>
            const monto = parseFloat(String(tAny.valor_monto)) || 0
            return sum + (tAny.valor_moneda === 'CLP' ? clpToUF(monto, tAny.uf_dia, ufSeguro) : monto)
        }, 0)

        const prospectosActivos = prospectos.filter(p => p.estado !== 'Convertido')

        const pipelineTotal = prospectosActivos.reduce((sum, p) => sum + (parseFloat(String(p.valor)) || 0), 0)
        const pipelinePonderado = prospectosActivos.reduce((sum, p) => sum + ((parseFloat(String(p.valor)) || 0) * ((parseFloat(String(p.probabilidad)) || 10) / 100)), 0)

        const valorGanadoEsteMes = ganadosEsteMes.reduce((sum, c) => sum + (parseFloat(String(c.valor)) || 0), 0)
        const valorGanadoMesAnterior = ganadosMesAnterior.reduce((sum, c) => sum + (parseFloat(String(c.valor)) || 0), 0)
        const ingresosEsteMes = mrrActual + valorTickets
        const variacionIngresos = valorGanadoMesAnterior > 0
            ? Math.round(((valorGanadoEsteMes - valorGanadoMesAnterior) / valorGanadoMesAnterior) * 100)
            : valorGanadoEsteMes > 0 ? 100 : 0

        // Vencido = fecha límite ANTERIOR a hoy (comparación de strings YYYY-MM-DD, sin timezone)
        const prospectosVencidos = prospectosActivos.filter(p => p.fecha_limite && String(p.fecha_limite).slice(0, 10) < hoyStr)
        // "Sin actividad" = sin EDICIONES en 14 días (updated_at); cualquier edición lo resetea
        const prospectosSinActividad = prospectosActivos.filter(p => {
            if (!p.updated_at) return false
            return Math.floor((Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)) > 14
        })
        const ticketsProximosEntrega = tickets.filter(t => {
            const tAny = t as unknown as Record<string, unknown>
            const dias = diasDesdeHoy(tAny.fecha_entrega as string)
            return dias !== null && dias >= 0 && dias <= 7
        })
        const keyAccountsPorRenovar = keyAccounts.filter(ka => {
            const dias = diasDesdeHoy(ka.fin_contrato)
            return dias !== null && dias > 0 && dias <= 30
        })

        // Conversión del MES actual (comparable con la del mes anterior).
        // La histórica global se expone aparte como tasaConversionGlobal.
        const tasaConversion = cerradosEsteMes.length > 0
            ? Math.round((ganadosEsteMes.length / cerradosEsteMes.length) * 100)
            : 0
        const tasaConversionGlobal = cerrados.length > 0
            ? Math.round((cerrados.filter(c => (c as unknown as Record<string, unknown>).estado_final === 'Ganado').length / cerrados.length) * 100)
            : 0
        const tasaConversionMesAnterior = cerradosMesAnterior.length > 0
            ? Math.round((ganadosMesAnterior.length / cerradosMesAnterior.length) * 100)
            : 0

        const metrics = {
            totalProspectos: prospectosActivos.length,
            pipelineTotal, pipelinePonderado,
            proximosCierres: prospectosActivos.filter(p => (parseFloat(String(p.probabilidad)) || 0) > 60).length,
            ingresosEsteMes, valorTickets, variacionIngresos,
            valorGanadoEsteMes, valorGanadoMesAnterior, mrrActual,
            tasaConversion, tasaConversionGlobal, tasaConversionMesAnterior,
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
        }

        return { metrics, prospectosActivos }
    }, [prospectos, cerrados, tickets, keyAccounts, ufActual])

    const prospectosPorEstado = useCallback((estadoKey: string, override?: Prospecto[]) => {
        const lista = override || prospectosActivos
        return lista.filter(p => ESTADO_TO_KEY[p.estado ?? ''] === estadoKey)
    }, [prospectosActivos])

    const getEstadoFromKey = useCallback((key: string): string => KEY_TO_ESTADO[key] || 'Contactado', [])

    return { metrics, estadosKanban: ESTADOS_KANBAN, prospectosPorEstado, getEstadoFromKey }
}
