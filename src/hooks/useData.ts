import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { obtenerUFHoy } from '../utils/formatters'
import { showToast } from '../utils/toast'
import type {
    Prospecto, Cerrado, Ticket, KeyAccount, Contacto, Nota,
    FacturaEmitida, FacturaRecibida, BoletaHonorario, SueldoSocio,
    CajaChica, MovimientoBancario
} from '../types'

type User = { email?: string; id?: string } | null

// Helper para loggear y notificar errores de Supabase.
function reportLoadError(scope: string, error: { message?: string; code?: string } | null) {
    if (!error) return
    console.error(`[useData] ${scope}:`, error.message || error)
    if (error.code && error.code !== 'PGRST116') {
        showToast(`No se pudo cargar ${scope}: ${error.message || 'error'}`, 'error')
    }
}

export default function useData(user: User) {
    const [prospectos, setProspectos] = useState<Prospecto[]>([])
    const [cerrados, setCerrados] = useState<Cerrado[]>([])
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [keyAccounts, setKeyAccounts] = useState<KeyAccount[]>([])
    const [contactos, setContactos] = useState<Contacto[]>([])
    const [notas, setNotas] = useState<Nota[]>([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [actividadReciente, setActividadReciente] = useState<any[]>([])
    const [facturasEmitidas, setFacturasEmitidas] = useState<FacturaEmitida[]>([])
    const [facturasRecibidas, setFacturasRecibidas] = useState<FacturaRecibida[]>([])
    const [cajaChica, setCajaChica] = useState<CajaChica[]>([])
    const [boletasHonorarios, setBoletasHonorarios] = useState<BoletaHonorario[]>([])
    const [sueldosSocios, setSueldosSocios] = useState<SueldoSocio[]>([])
    const [movimientosBancarios, setMovimientosBancarios] = useState<MovimientoBancario[]>([])
    const [ufActual, setUfActual] = useState<number>(38000)

    const [coreLoading, setCoreLoading] = useState(true)
    const [financeLoading, setFinanceLoading] = useState(false)
    const [financeLoaded, setFinanceLoaded] = useState(false)

    const loadProspectos = useCallback(async () => {
        const { data, error } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false })
        reportLoadError('prospectos', error)
        if (data) setProspectos(data as Prospecto[])
    }, [])

    const loadCerrados = useCallback(async () => {
        const { data, error } = await supabase.from('cerrados').select('*').order('fecha_cierre', { ascending: false })
        reportLoadError('cerrados', error)
        if (data) setCerrados(data as Cerrado[])
    }, [])

    const loadTickets = useCallback(async () => {
        const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false })
        reportLoadError('tickets', error)
        if (data) setTickets(data.map((t: Record<string, unknown>) => ({
            ...t, valor_monto: t.valor_monto || 0, valor_moneda: t.valor_moneda || 'UF'
        })) as unknown as Ticket[])
    }, [])

    const loadKeyAccounts = useCallback(async () => {
        const { data, error } = await supabase.from('key_accounts').select('*').order('organizacion')
        reportLoadError('key accounts', error)
        if (data) {
            const hoy = new Date().toISOString().split('T')[0]
            const expiredIds = (data as KeyAccount[])
                .filter(ka => ka.fin_contrato && ka.fin_contrato < hoy &&
                    (ka.salud || '').toLowerCase() !== 'cerrado' &&
                    (ka.salud || '').toLowerCase() !== 'vencido')
                .map(ka => ka.id)
            if (expiredIds.length > 0) {
                const { error: updErr } = await supabase.from('key_accounts').update({ salud: 'Vencido' }).in('id', expiredIds)
                if (updErr) console.warn('[useData] auto-expire KA:', updErr.message)
                const patched = (data as KeyAccount[]).map(ka => expiredIds.includes(ka.id) ? { ...ka, salud: 'Vencido' as const } : ka)
                setKeyAccounts(patched)
                return
            }
            setKeyAccounts(data as KeyAccount[])
        }
    }, [])

    const loadContactos = useCallback(async () => {
        const { data, error } = await supabase.from('contactos').select('*').order('organizacion')
        reportLoadError('contactos', error)
        if (data) setContactos(data as Contacto[])
    }, [])

    const loadNotas = useCallback(async () => {
        const { data, error } = await supabase.from('notas').select('*').order('created_at', { ascending: false })
        reportLoadError('notas', error)
        if (data) setNotas(data as Nota[])
    }, [])

    const loadActividad = useCallback(async () => {
        try {
            const [eventsRes, transRes, notasRes] = await Promise.all([
                supabase.from('crm_events').select('*').order('created_at', { ascending: false }).limit(20),
                supabase.from('crm_transitions').select('*').order('created_at', { ascending: false }).limit(10),
                supabase.from('notas').select('*').order('created_at', { ascending: false }).limit(10)
            ])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items: any[] = []
            if (eventsRes.data) eventsRes.data.forEach((e: Record<string, unknown>) => {
                let label = String(e.event_type || 'actividad')
                if (label.includes('insert')) label = `Nuevo registro (${e.entity_type})`
                else if (label.includes('update')) label = `Actualización (${e.entity_type})`
                items.push({ ...e, label, kind: 'event' })
            })
            if (transRes.data) transRes.data.forEach((t: Record<string, unknown>) => {
                items.push({ ...t, label: `Transición: ${t.from_stage || '?'} → ${t.to_stage || '?'}`, kind: 'transition' })
            })
            if (notasRes.data) notasRes.data.forEach((n: Record<string, unknown>) => {
                items.push({ ...n, label: `Nota (${n.tipo || 'nota'})`, kind: 'nota', created_at: n.created_at })
            })
            items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            setActividadReciente(items.slice(0, 30))
        } catch (e) { console.error('Error loading activity:', e) }
    }, [])

    const loadFacturasEmitidas = useCallback(async () => {
        const { data, error } = await supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false })
        reportLoadError('facturas emitidas', error)
        if (data) setFacturasEmitidas(data as FacturaEmitida[])
    }, [])

    const loadFacturasRecibidas = useCallback(async () => {
        const { data, error } = await supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false })
        reportLoadError('facturas recibidas', error)
        if (data) setFacturasRecibidas(data as FacturaRecibida[])
    }, [])

    const loadCajaChica = useCallback(async () => {
        const { data, error } = await supabase.from('caja_chica').select('*').order('fecha', { ascending: false })
        reportLoadError('caja chica', error)
        if (data) setCajaChica(data as CajaChica[])
    }, [])

    const loadBoletasHonorarios = useCallback(async () => {
        const { data, error } = await supabase.from('boletas_honorarios').select('*').order('fecha', { ascending: false })
        reportLoadError('boletas honorarios', error)
        if (data) setBoletasHonorarios(data as BoletaHonorario[])
    }, [])

    const loadSueldosSocios = useCallback(async () => {
        const { data, error } = await supabase.from('sueldos_socios').select('*').order('fecha', { ascending: false })
        reportLoadError('sueldos socios', error)
        if (data) setSueldosSocios(data as SueldoSocio[])
    }, [])

    const loadMovimientosBancarios = useCallback(async () => {
        const { data, error } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false })
        reportLoadError('movimientos bancarios', error)
        if (data) setMovimientosBancarios(data as MovimientoBancario[])
    }, [])

    const loadCoreData = useCallback(async () => {
        await Promise.all([
            loadProspectos(), loadCerrados(), loadTickets(), loadKeyAccounts(),
            loadContactos(), loadNotas(), loadActividad()
        ])
    }, [loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas, loadActividad])

    const loadFinanceData = useCallback(async () => {
        await Promise.all([
            loadFacturasEmitidas(), loadFacturasRecibidas(),
            loadCajaChica(), loadBoletasHonorarios(), loadSueldosSocios(),
            loadMovimientosBancarios()
        ])
    }, [loadFacturasEmitidas, loadFacturasRecibidas, loadCajaChica, loadBoletasHonorarios, loadSueldosSocios, loadMovimientosBancarios])

    const loadAllData = useCallback(async () => {
        await Promise.all([loadCoreData(), loadFinanceData()])
    }, [loadCoreData, loadFinanceData])

    const ensureFinanceData = useCallback(async () => {
        if (financeLoaded || financeLoading) return
        setFinanceLoading(true)
        try {
            await loadFinanceData()
            setFinanceLoaded(true)
        } finally {
            setFinanceLoading(false)
        }
    }, [financeLoaded, financeLoading, loadFinanceData])

    useEffect(() => {
        if (!user) return
        setCoreLoading(true)
        setFinanceLoaded(false)
        loadCoreData().finally(() => setCoreLoading(false))
    }, [user?.email, loadCoreData])

    useEffect(() => {
        obtenerUFHoy().then(uf => setUfActual(uf))
        const t = setInterval(() => { obtenerUFHoy().then(uf => setUfActual(uf)) }, 6 * 60 * 60 * 1000)
        return () => clearInterval(t)
    }, [])

    // Auto-refresh cuando el usuario vuelve al tab — evita que otro socio tenga que
    // recargar la página para ver cambios que hizo un colega. Solo recarga datos core
    // (no finanzas) para mantener el impacto en red mínimo.
    useEffect(() => {
        if (!user) return
        let lastRefresh = Date.now()
        const MIN_INTERVAL_MS = 60_000 // no más de una vez por minuto

        const handleVisibility = () => {
            if (document.hidden) return
            const elapsed = Date.now() - lastRefresh
            if (elapsed < MIN_INTERVAL_MS) return
            lastRefresh = Date.now()
            loadCoreData()
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [user, loadCoreData])

    return {
        prospectos, setProspectos, cerrados, setCerrados, tickets, setTickets,
        keyAccounts, setKeyAccounts, contactos, setContactos, notas, setNotas,
        actividadReciente, facturasEmitidas, setFacturasEmitidas,
        facturasRecibidas, setFacturasRecibidas, cajaChica, setCajaChica,
        boletasHonorarios, setBoletasHonorarios, sueldosSocios, setSueldosSocios,
        movimientosBancarios, setMovimientosBancarios, ufActual,
        loadProspectos, loadCerrados, loadTickets, loadKeyAccounts,
        loadContactos, loadNotas, loadActividad, loadAllData,
        loadFacturasEmitidas, loadFacturasRecibidas, loadCajaChica,
        loadBoletasHonorarios, loadSueldosSocios, loadMovimientosBancarios,
        loadCoreData, loadFinanceData, ensureFinanceData,
        coreLoading, financeLoading, financeLoaded
    }
}
