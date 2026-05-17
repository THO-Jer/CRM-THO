import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { obtenerUFHoy } from '../utils/formatters'
import { showToast } from '../utils/toast'

// Helper para loggear y notificar errores de Supabase. Antes los loadX
// destructuraban sólo `data`, lo que dejaba pasar errores silenciosamente.
function reportLoadError(scope, error) {
    if (!error) return;
    console.error(`[useData] ${scope}:`, error.message || error);
    // Sólo notificamos al usuario para errores no triviales — RLS y red.
    if (error.code && error.code !== 'PGRST116') {
        showToast(`No se pudo cargar ${scope}: ${error.message || 'error'}`, 'error');
    }
}

export default function useData(user) {
    const [prospectos, setProspectos] = useState([]);
    const [cerrados, setCerrados] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [keyAccounts, setKeyAccounts] = useState([]);
    const [contactos, setContactos] = useState([]);
    const [notas, setNotas] = useState([]);
    const [actividadReciente, setActividadReciente] = useState([]);
    const [facturasEmitidas, setFacturasEmitidas] = useState([]);
    const [facturasRecibidas, setFacturasRecibidas] = useState([]);
    const [cajaChica, setCajaChica] = useState([]);
    const [boletasHonorarios, setBoletasHonorarios] = useState([]);
    const [sueldosSocios, setSueldosSocios] = useState([]);
    const [movimientosBancarios, setMovimientosBancarios] = useState([]);
    const [ufActual, setUfActual] = useState(38000);

    // Loading flags:
    // - coreLoading: true mientras carga el dataset core en el login.
    // - financeLoading / financeLoaded: la data financiera se carga de forma
    //   diferida la primera vez que el usuario abre una pestaña de Finanzas.
    const [coreLoading, setCoreLoading] = useState(true);
    const [financeLoading, setFinanceLoading] = useState(false);
    const [financeLoaded, setFinanceLoaded] = useState(false);

    const loadProspectos = useCallback(async () => {
        const { data, error } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false });
        reportLoadError('prospectos', error);
        if (data) setProspectos(data);
    }, []);

    const loadCerrados = useCallback(async () => {
        const { data, error } = await supabase.from('cerrados').select('*').order('fecha_cierre', { ascending: false });
        reportLoadError('cerrados', error);
        if (data) setCerrados(data);
    }, []);

    const loadTickets = useCallback(async () => {
        const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
        reportLoadError('tickets', error);
        if (data) setTickets(data.map(t => ({
            ...t,
            valor_monto: t.valor_monto || 0,
            valor_moneda: t.valor_moneda || 'UF'
        })));
    }, []);

    const loadKeyAccounts = useCallback(async () => {
        const { data, error } = await supabase.from('key_accounts').select('*').order('organizacion');
        reportLoadError('key accounts', error);
        if (data) {
            const hoy = new Date().toISOString().split('T')[0];
            // Auto-expire: marca KAs vencidos en una sola query (.in) en vez de un loop secuencial.
            const expiredIds = data
                .filter(ka =>
                    ka.fin_contrato && ka.fin_contrato < hoy &&
                    (ka.salud || '').toLowerCase() !== 'cerrado' &&
                    (ka.salud || '').toLowerCase() !== 'vencido'
                )
                .map(ka => ka.id);
            if (expiredIds.length > 0) {
                const { error: updErr } = await supabase
                    .from('key_accounts')
                    .update({ salud: 'Vencido' })
                    .in('id', expiredIds);
                if (updErr) console.warn('[useData] auto-expire KA:', updErr.message);
                // Patch local en lugar de re-fetch — más rápido y consistente.
                const patched = data.map(ka => expiredIds.includes(ka.id) ? { ...ka, salud: 'Vencido' } : ka);
                setKeyAccounts(patched);
                return;
            }
            setKeyAccounts(data);
        }
    }, []);

    const loadContactos = useCallback(async () => {
        const { data, error } = await supabase.from('contactos').select('*').order('organizacion');
        reportLoadError('contactos', error);
        if (data) setContactos(data);
    }, []);

    const loadNotas = useCallback(async () => {
        const { data, error } = await supabase.from('notas').select('*').order('created_at', { ascending: false });
        reportLoadError('notas', error);
        if (data) setNotas(data);
    }, []);

    const loadActividad = useCallback(async () => {
        try {
            const [eventsRes, transRes, notasRes] = await Promise.all([
                supabase.from('crm_events').select('*').order('created_at', { ascending: false }).limit(20),
                supabase.from('crm_transitions').select('*').order('created_at', { ascending: false }).limit(10),
                supabase.from('notas').select('*').order('created_at', { ascending: false }).limit(10)
            ]);
            const items = [];
            if (eventsRes.data) eventsRes.data.forEach(e => {
                let label = e.event_type || 'actividad';
                if (label.includes('insert')) label = `Nuevo registro (${e.entity_type})`;
                else if (label.includes('update')) label = `Actualización (${e.entity_type})`;
                items.push({ ...e, label, kind: 'event' });
            });
            if (transRes.data) transRes.data.forEach(t => {
                items.push({ ...t, label: `Transición: ${t.from_stage || '?'} → ${t.to_stage || '?'}`, kind: 'transition' });
            });
            if (notasRes.data) notasRes.data.forEach(n => {
                items.push({ ...n, label: `Nota (${n.tipo || 'nota'})`, kind: 'nota', created_at: n.created_at });
            });
            items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setActividadReciente(items.slice(0, 30));
        } catch (e) { console.error('Error loading activity:', e); }
    }, []);

    const loadFacturasEmitidas = useCallback(async () => {
        const { data, error } = await supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false });
        reportLoadError('facturas emitidas', error);
        if (data) setFacturasEmitidas(data);
    }, []);

    const loadFacturasRecibidas = useCallback(async () => {
        const { data, error } = await supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false });
        reportLoadError('facturas recibidas', error);
        if (data) setFacturasRecibidas(data);
    }, []);

    const loadCajaChica = useCallback(async () => {
        const { data, error } = await supabase.from('caja_chica').select('*').order('fecha', { ascending: false });
        reportLoadError('caja chica', error);
        if (data) setCajaChica(data);
    }, []);

    const loadBoletasHonorarios = useCallback(async () => {
        const { data, error } = await supabase.from('boletas_honorarios').select('*').order('fecha', { ascending: false });
        reportLoadError('boletas honorarios', error);
        if (data) setBoletasHonorarios(data);
    }, []);

    const loadSueldosSocios = useCallback(async () => {
        const { data, error } = await supabase.from('sueldos_socios').select('*').order('fecha', { ascending: false });
        reportLoadError('sueldos socios', error);
        if (data) setSueldosSocios(data);
    }, []);

    const loadMovimientosBancarios = useCallback(async () => {
        const { data, error } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false });
        reportLoadError('movimientos bancarios', error);
        if (data) setMovimientosBancarios(data);
    }, []);

    // Core data — necesario para Dashboard, Pipeline, Tickets, Key Accounts,
    // Historial y Reportes. Se carga al iniciar sesión.
    const loadCoreData = useCallback(async () => {
        await Promise.all([
            loadProspectos(), loadCerrados(), loadTickets(), loadKeyAccounts(),
            loadContactos(), loadNotas(), loadActividad()
        ]);
    }, [loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas, loadActividad]);

    // Finance data — sólo necesario para las pestañas de Finanzas. Se carga
    // de forma diferida la primera vez que el usuario entra a una de ellas.
    const loadFinanceData = useCallback(async () => {
        await Promise.all([
            loadFacturasEmitidas(), loadFacturasRecibidas(),
            loadCajaChica(), loadBoletasHonorarios(), loadSueldosSocios(),
            loadMovimientosBancarios()
        ]);
    }, [loadFacturasEmitidas, loadFacturasRecibidas, loadCajaChica, loadBoletasHonorarios, loadSueldosSocios, loadMovimientosBancarios]);

    // Conveniencia: carga todo de una. Conservado por compatibilidad.
    const loadAllData = useCallback(async () => {
        await Promise.all([loadCoreData(), loadFinanceData()]);
    }, [loadCoreData, loadFinanceData]);

    // ensureFinanceData — App.jsx lo llama cuando el usuario abre una pestaña
    // de Finanzas. Carga los datasets financieros una sola vez por sesión.
    const ensureFinanceData = useCallback(async () => {
        if (financeLoaded || financeLoading) return;
        setFinanceLoading(true);
        try {
            await loadFinanceData();
            setFinanceLoaded(true);
        } finally {
            setFinanceLoading(false);
        }
    }, [financeLoaded, financeLoading, loadFinanceData]);

    // Al iniciar sesión: cargar sólo lo core. Las finanzas van diferidas.
    // La dep es `user?.email` (string) y no el objeto user — antes onAuthStateChange
    // recreaba el objeto en cada evento y disparaba doble fetch.
    useEffect(() => {
        if (!user) return;
        setCoreLoading(true);
        setFinanceLoaded(false); // reset del cache financiero en cada login
        loadCoreData().finally(() => setCoreLoading(false));
    }, [user?.email, loadCoreData]);

    // UF: cargar al montar y refrescar cada 6h para sesiones largas.
    useEffect(() => {
        obtenerUFHoy().then(uf => setUfActual(uf));
        const t = setInterval(() => { obtenerUFHoy().then(uf => setUfActual(uf)); }, 6 * 60 * 60 * 1000);
        return () => clearInterval(t);
    }, []);

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
        // Carga diferida + loading flags
        loadCoreData, loadFinanceData, ensureFinanceData,
        coreLoading, financeLoading, financeLoaded
    };
}
