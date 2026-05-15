import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { obtenerUFHoy } from '../utils/formatters'

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
        const { data } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false });
        if (data) setProspectos(data);
    }, []);

    const loadCerrados = useCallback(async () => {
        const { data } = await supabase.from('cerrados').select('*').order('fecha_cierre', { ascending: false });
        if (data) setCerrados(data);
    }, []);

    const loadTickets = useCallback(async () => {
        const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
        if (data) setTickets(data.map(t => ({
            ...t,
            valor_monto: t.valor_monto || 0,
            valor_moneda: t.valor_moneda || 'UF'
        })));
    }, []);

    const loadKeyAccounts = useCallback(async () => {
        const { data } = await supabase.from('key_accounts').select('*').order('organizacion');
        if (data) {
            const hoy = new Date().toISOString().split('T')[0];
            // Auto-expire: mark KAs past fin_contrato as 'Vencido' (unless already Cerrado)
            const expired = data.filter(ka =>
                ka.fin_contrato && ka.fin_contrato < hoy &&
                (ka.salud || '').toLowerCase() !== 'cerrado' && (ka.salud || '').toLowerCase() !== 'vencido'
            );
            if (expired.length > 0) {
                for (const ka of expired) {
                    await supabase.from('key_accounts').update({ salud: 'Vencido' }).eq('id', ka.id);
                }
                // Re-fetch with updated salud
                const { data: refreshed } = await supabase.from('key_accounts').select('*').order('organizacion');
                if (refreshed) { setKeyAccounts(refreshed); return; }
            }
            setKeyAccounts(data);
        }
    }, []);

    const loadContactos = useCallback(async () => {
        const { data } = await supabase.from('contactos').select('*').order('organizacion');
        if (data) setContactos(data);
    }, []);

    const loadNotas = useCallback(async () => {
        const { data } = await supabase.from('notas').select('*').order('created_at', { ascending: false });
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
        const { data } = await supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false });
        if (data) setFacturasEmitidas(data);
    }, []);

    const loadFacturasRecibidas = useCallback(async () => {
        const { data } = await supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false });
        if (data) setFacturasRecibidas(data);
    }, []);

    const loadCajaChica = useCallback(async () => {
        const { data } = await supabase.from('caja_chica').select('*').order('fecha', { ascending: false });
        if (data) setCajaChica(data);
    }, []);

    const loadBoletasHonorarios = useCallback(async () => {
        const { data } = await supabase.from('boletas_honorarios').select('*').order('fecha', { ascending: false });
        if (data) setBoletasHonorarios(data);
    }, []);

    const loadSueldosSocios = useCallback(async () => {
        const { data } = await supabase.from('sueldos_socios').select('*').order('fecha', { ascending: false });
        if (data) setSueldosSocios(data);
    }, []);

    const loadMovimientosBancarios = useCallback(async () => {
        const { data } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false });
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
    useEffect(() => {
        if (!user) return;
        setCoreLoading(true);
        setFinanceLoaded(false); // reset del cache financiero en cada login
        loadCoreData().finally(() => setCoreLoading(false));
    }, [user, loadCoreData]);

    useEffect(() => { obtenerUFHoy().then(uf => setUfActual(uf)); }, []);

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
