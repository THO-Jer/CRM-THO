import { useMemo, useCallback } from 'react'
import type { Prospecto, Cerrado, Ticket, KeyAccount } from '../types'
import { clpToUF } from '../utils/formatters'

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
        const hoy = new Date()
        const mesActual = hoy.getMonth()
        const añoActual = hoy.getFullYear()
        const mesAnterior = mesActual === 0 ? 11 : mesActual - 1
        const añoMesAnterior = mesActual === 0 ? añoActual - 1 : añoActual

        const cerradosEsteMes = cerrados.filter(c => { const f = new Date(c.fecha_cierre ?? ''); return f.getMonth() === mesActual && f.getFullYear() === añoActual })
        const cerradosMesAnterior = cerrados.filter(c => { const f = new Date(c.fecha_cierre ?? ''); return f.getMonth() === mesAnterior && f.getFullYear() === añoMesAnterior })
        const ganadosEsteMes = cerradosEsteMes.filter(c => (c as unknown as Record<string, unknown>).estado_final === 'Ganado')
        const ganadosMesAnterior = cerradosMesAnterior.filter(c => (c as unknown as Record<string, unknown>).estado_final === 'Ganado')

        const mrrActual = keyAccounts.filter(ka => (ka.salud || '').toLowerCase() !== 'cerrado').reduce((sum, ka) => sum + (parseFloat(String(ka.uf_mes)) || 0), 0)

        const ufSeguro = Number(ufActual) > 0 ? Number(ufActual) : 38000
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

        const prospectosVencidos = prospectosActivos.filter(p => p.fecha_limite && new Date(p.fecha_limite) < hoy)
        const prospectosSinActividad = prospectosActivos.filter(p => {
            if (!p.updated_at) return false
            return Math.floor((hoy.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)) > 14
        })
        const ticketsProximosEntrega = tickets.filter(t => {
            const tAny = t as unknown as Record<string, unknown>
            if (!tAny.fecha_entrega) return false
            const dias = Math.ceil((new Date(tAny.fecha_entrega as string).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
            return dias >= 0 && dias <= 7
        })
        const keyAccountsPorRenovar = keyAccounts.filter(ka => {
            if (!ka.fin_contrato) return false
            const dias = Math.floor((new Date(ka.fin_contrato).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
            return dias > 0 && dias <= 30
        })

        const tasaConversion = cerrados.length > 0
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
            tasaConversion, tasaConversionMesAnterior,
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
