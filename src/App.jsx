import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { supabase } from './utils/supabase'
import { formatFileSize } from './utils/formatters'

// Modales y utilidades — eager: son chicos y se renderizan condicionalmente.
import LoginModal from './components/Modals/LoginModal'
import UniversalModal from './components/Modals/UniversalModal'
import HistoryModal from './components/shared/HistoryModal'
import FilesModal from './components/shared/FilesModal'
import DateRangeFilter from './components/shared/DateRangeFilter'
import useEscapeKey from './hooks/useEscapeKey'

// EntityDetail importa jsPDF; lazy-load para mantenerlo fuera del bundle inicial.
const EntityDetail = lazy(() => import('./components/Detail/EntityDetail'))

// Componentes de tab — lazy-loaded: cada uno se descarga sólo cuando el usuario
// entra a su pestaña. ContabilidadView y ReportesView arrastran chart.js/xlsx,
// así que mantenerlos fuera del bundle inicial es la mayor ganancia de peso.
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'))
const ContabilidadView = lazy(() => import('./components/Contabilidad/ContabilidadView'))
const KanbanBoard = lazy(() => import('./components/Pipeline/KanbanBoard'))
const ReportesView = lazy(() => import('./components/Reportes/ReportesView'))
const CerradosView = lazy(() => import('./components/Cerrados/CerradosView'))
const TicketsView = lazy(() => import('./components/Tickets/TicketsView'))
const KeyAccountsView = lazy(() => import('./components/KeyAccounts/KeyAccountsView'))

// Fallback mientras carga el chunk de una pestaña lazy-loaded.
function TabLoader() {
    return (
        <div className="flex items-center justify-center py-24">
            <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700"></div>
                <div className="absolute inset-0 rounded-full border-2 border-naranja border-t-transparent animate-spin"></div>
            </div>
        </div>
    )
}

// Error logging (sin manipular el DOM de React)
if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
        console.error('[CRM Error]', e?.error || e?.message || e);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[CRM Unhandled Rejection]', e?.reason || e);
    });
}

// Función utilitaria para exportar datos a CSV
import useData from './hooks/useData'
import useCRMActions from './hooks/useCRMActions'
import useFinanzas from './hooks/useFinanzas'
import useMetrics from './hooks/useMetrics'
import useExcelImport from './hooks/useExcelImport'

// localStorage seguro (Safari modo privado puede tirar QuotaExceededError)
const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* silencio */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* silencio */ } },
};

function exportToCSV(data, filename = 'export.csv') {
    if (!data || data.length === 0) return;
    const excludeFields = ['id', 'created_at', 'created_by_email', 'updated_at'];
    // Union de todas las keys — evita perder columnas que aparezcan recién en items 2+
    const allKeys = new Set();
    data.forEach(row => Object.keys(row || {}).forEach(k => {
        if (!excludeFields.includes(k)) allKeys.add(k);
    }));
    const headers = Array.from(allKeys);
    if (headers.length === 0) return;
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n') 
                ? `"${str.replace(/"/g, '""')}"` 
                : str;
        }).join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Timestamp completo para evitar overwrites en el mismo día
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = filename.replace(/\.csv$/i, '') + `-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
function CRMApp() {
    // ===== AUTH =====
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const email = session.user.email || '';
                    const namePart = email.includes('@') ? email.split('@')[0] : email;
                    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || namePart;
                    setUser({ email, name });
                    safeStorage.set('crm_tho_email', email);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.warn('OAuth session check failed:', e);
            }
            const savedEmail = safeStorage.get('crm_tho_email');
            if (savedEmail) setUser({ email: savedEmail, name: savedEmail.split('@')[0] });
            setLoading(false);
        };
        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const email = session.user.email || '';
                const namePart = email.includes('@') ? email.split('@')[0] : email;
                const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || namePart;
                setUser({ email, name });
                safeStorage.set('crm_tho_email', email);
                setShowLoginModal(false);
            }
            if (event === 'SIGNED_OUT') { setUser(null); safeStorage.remove('crm_tho_email'); }
        });
        return () => subscription.unsubscribe();
    }, []);

    // handleLogin se eliminó al cerrar las RLS — el único path de login válido
    // ahora es Microsoft OAuth, que se procesa vía supabase.auth.onAuthStateChange
    // arriba (evento 'SIGNED_IN') y setea el user automáticamente.

    const requireAuth = () => {
        if (!user) { setShowLoginModal(true); return false; }
        return true;
    };

    // ===== DATA HOOK =====
    const data = useData(user);
    const { prospectos, cerrados, tickets, keyAccounts, contactos, notas, actividadReciente,
        facturasEmitidas, facturasRecibidas, cajaChica, boletasHonorarios, sueldosSocios,
        movimientosBancarios, ufActual,
        loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas,
        loadActividad, loadAllData, loadFacturasEmitidas, loadFacturasRecibidas,
        loadCajaChica, loadBoletasHonorarios, loadSueldosSocios, loadMovimientosBancarios,
        setFacturasEmitidas, setFacturasRecibidas, setCajaChica, setBoletasHonorarios,
        setSueldosSocios, setMovimientosBancarios,
        coreLoading, financeLoading, ensureFinanceData } = data;

    // Tabs que viven en la sección Finanzas — disparan la carga diferida de sus datos.
    const FINANCE_TABS = ['finanzas-dashboard', 'contabilidad', 'conciliacion'];

    // Active KAs = exclude Cerrado and Vencido (used everywhere except EntityDetail)
    const activeKeyAccounts = useMemo(() => 
        keyAccounts.filter(ka => !['cerrado', 'vencido'].includes((ka.salud || '').toLowerCase())),
        [keyAccounts]
    );

    // Active Tickets = exclude Cerrado
    const activeTickets = useMemo(() => 
        tickets.filter(t => t.status !== 'Cerrado'),
        [tickets]
    );

    // ===== EXCEL IMPORT HOOK =====
    // Reemplaza al antiguo useSII (la API del SII murió por seguridad).
    // Importa Excels descargados desde el SII a boletas/facturas.
    const { importarBoletasExcel, importarFacturasEmitidasExcel, importarFacturasRecibidasExcel } = useExcelImport({
        user, ufActual, loadBoletasHonorarios, loadFacturasEmitidas, loadFacturasRecibidas
    });

    // ===== METRICS HOOK =====
    const { metrics, estadosKanban, prospectosPorEstado, getEstadoFromKey } = useMetrics({ prospectos, cerrados, tickets: activeTickets, keyAccounts: activeKeyAccounts, ufActual });

    // setShowModal y editingItem se declaran aquí (antes de useCRMActions) porque el hook
    // los necesita como props (TDZ: const no se puede referenciar antes de su declaración).
    // El resto del UI STATE block sigue declarándose más abajo por consistencia visual.
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // ===== CRM ACTIONS HOOK =====
    const actions = useCRMActions({
        user,
        requireAuth,
        setShowModal,
        editingItem,
        data: { prospectos, setProspectos: data.setProspectos, cerrados, setCerrados: data.setCerrados, tickets, setTickets: data.setTickets, keyAccounts, setKeyAccounts: data.setKeyAccounts },
        loaders: { loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas, loadActividad }
    });

    // ===== FINANZAS HOOK =====
    const finanzas = useFinanzas({
        user, movimientosBancarios, setMovimientosBancarios,
        facturasEmitidas, facturasRecibidas, boletasHonorarios, sueldosSocios, cajaChica,
        ufActual,
        loadMovimientosBancarios, loadCajaChica,
        loadFacturasEmitidas, loadFacturasRecibidas, loadBoletasHonorarios, loadSueldosSocios
    });

    // ===== UI STATE =====
    const [activeTab, setActiveTab] = useState('dashboard');
    const [dateRange, setDateRange] = useState({ desde: '', hasta: '' });
    // showModal/setShowModal se declara arriba (antes de useCRMActions) — ver comentario allá.
    const [modalType, setModalType] = useState('prospecto');
    // editingItem/setEditingItem se declara arriba (antes de useCRMActions) — ver comentario allá.
    const [searchTerm, setSearchTerm] = useState('');
    const [globalSearch, setGlobalSearch] = useState('');
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);
    const [filterTipo, setFilterTipo] = useState('todos');
    const [monedaPreferida, setMonedaPreferida] = useState(() => safeStorage.get('monedaPreferida') || 'CLP');
    const [contaTab, setContaTab] = useState('dashboard');
    const [alertasValidacion, setAlertasValidacion] = useState([]);
    const [darkMode, setDarkMode] = useState(() => safeStorage.get('darkMode') === 'true');

    // Persistir moneda preferida
    useEffect(() => { safeStorage.set('monedaPreferida', monedaPreferida); }, [monedaPreferida]);

    // Dark mode
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', darkMode);
        safeStorage.set('darkMode', darkMode);
    }, [darkMode]);

    // Carga diferida de datos financieros: la primera vez que el usuario abre
    // una pestaña de Finanzas, se disparan las queries de facturas/boletas/etc.
    useEffect(() => {
        if (FINANCE_TABS.includes(activeTab)) ensureFinanceData();
    }, [activeTab, ensureFinanceData]);

    // Cmd+K search — usamos updater functions y un guard para evitar reinstalar el
    // listener en cada cambio de showGlobalSearch.
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowGlobalSearch(prev => !prev);
            }
            if (e.key === 'Escape') {
                setShowGlobalSearch(prev => { if (prev) { setGlobalSearch(''); return false; } return prev; });
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Date range filter — extrae sólo la parte ISO (YYYY-MM-DD) por si la fecha de DB viene con timestamp.
    const filterByDateRange = (items, dateField) => {
        if (!dateRange.desde && !dateRange.hasta) return items;
        return items.filter(item => {
            const raw = item[dateField];
            if (!raw) return true;
            const d = String(raw).slice(0, 10);
            if (dateRange.desde && d < dateRange.desde) return false;
            if (dateRange.hasta && d > dateRange.hasta) return false;
            return true;
        });
    };
    const filteredCerrados = useMemo(() => filterByDateRange(cerrados, 'fecha_cierre'), [cerrados, dateRange.desde, dateRange.hasta]);
    const filteredTickets = useMemo(() => filterByDateRange(activeTickets, 'fecha_inicio'), [activeTickets, dateRange.desde, dateRange.hasta]);
    const filteredKeyAccounts = useMemo(() => filterByDateRange(activeKeyAccounts, 'inicio_contrato'), [activeKeyAccounts, dateRange.desde, dateRange.hasta]);

    // Pipeline: aplicamos searchTerm y filterTipo a los prospectos antes de pasarlos al kanban.
    // Antes los inputs existían pero no filtraban nada.
    const filteredProspectos = useMemo(() => {
        const q = (searchTerm || '').trim().toLowerCase();
        return prospectos.filter(p => {
            // filterTipo "Ticket" matchea "Ticket RC Express", "Ticket Diag Org", etc.
            // (los `tipo` reales en DB son específicos, no la categoría suelta).
            if (filterTipo !== 'todos' && !(p.tipo || '').startsWith(filterTipo)) return false;
            if (!q) return true;
            return (
                (p.organizacion || '').toLowerCase().includes(q) ||
                (p.contacto || '').toLowerCase().includes(q) ||
                (p.notas || '').toLowerCase().includes(q) ||
                (p.proximo_paso || '').toLowerCase().includes(q)
            );
        });
    }, [prospectos, searchTerm, filterTipo]);

    const prospectosPorEstadoFiltrado = (estadoId) => prospectosPorEstado(estadoId, filteredProspectos);

    // Destructure actions for render convenience
    const { historyOpen, historyLoading, historyTitle, historyItems, setHistoryItems, openHistory, setHistoryOpen,
        convertOpen, convertSource, convertTarget, convertForm, openConvert, openConvertFromCerrado, closeConvert, setConvertTarget, setConvertForm, submitConvert,
        renewalOpen, renewalKA, renewalMode, renewalForm, cancelAlsoRegisterLoss, openRenewal, openCancelKA, closeRenewal, setRenewalForm, setCancelAlsoRegisterLoss, submitRenewal,
        filesModalOpen, filesEntityName, filesList, filesLoading, uploadingFile, openFilesModal, setFilesModalOpen,
        selectedEntity, openDetail, setSelectedEntity,
        handleSaveProspecto, handleDeleteProspecto, handleMoveProspecto, handleCerrarProspecto,
        handleSaveOther, handleDeleteOther, handleCloseTicket,
        uploadFile, downloadFile, deleteFile, getFileIcon } = actions;

    const { importarCartola, buscarMatches, aplicarConciliacion, crearGastoCajaChica, ignorarMovimiento } = finanzas;

    // ESC para los modales inline (Convertir / Renovar). Va DESPUÉS del destructuring
    // de `actions` porque `closeConvert/closeRenewal/convertOpen/renewalOpen` se
    // declaran ahí — si lo movemos arriba, TDZ en runtime.
    useEscapeKey(closeConvert, convertOpen);
    useEscapeKey(closeRenewal, renewalOpen);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <img src="/logo-tho.png" alt="THO" className="h-16 mb-6 dark:brightness-0 dark:invert opacity-80" />
            <div className="relative w-10 h-10 mb-4">
                <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700"></div>
                <div className="absolute inset-0 rounded-full border-2 border-naranja border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors shadow-sm">
                <div className="max-w-7xl mx-auto px-3 md:px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/logo-tho.png" alt="THO" className="h-9 w-9 object-contain dark:brightness-0 dark:invert" />
                            <div className="hidden sm:block">
                                <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight">CRM</h1>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-tight">The Human Org</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="hidden md:flex items-center text-xs text-gray-500 dark:text-gray-400">
                                UF: ${ufActual.toLocaleString('es-CL')}
                            </div>
                            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                                <button
                                    onClick={() => setMonedaPreferida('UF')}
                                    className={`px-2 py-1 text-xs font-medium rounded transition ${
                                        monedaPreferida === 'UF'
                                            ? 'bg-verde text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    UF
                                </button>
                                <button
                                    onClick={() => setMonedaPreferida('CLP')}
                                    className={`px-2 py-1 text-xs font-medium rounded transition ${
                                        monedaPreferida === 'CLP'
                                            ? 'bg-verde text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-300 hover:text-gray-900'
                                    }`}
                                >
                                    CLP
                                </button>
                            </div>
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                            >
                                {darkMode ? '☀️' : '🌙'}
                            </button>
                            {user && (
                                <>
                                    <button onClick={() => { setEditingItem(null); setModalType('prospecto'); setShowModal(true); }} className="px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium whitespace-nowrap">+ Prospecto</button>
                                    <button onClick={() => {
                                        // Respeta los filtros actuales del pipeline (búsqueda + tipo).
                                        exportToCSV(filteredProspectos, 'pipeline.csv');
                                    }} className="hidden md:inline-flex px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm" title="Exportar pipeline (respeta filtros)">📥</button>
                                </>
                            )}
                            <div className="text-sm">
                                {user ? (
                                    <div className="flex items-center gap-2">
                                        <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400">{user.email.split('@')[0]}</span>
                                        <button onClick={async () => { await supabase.auth.signOut(); safeStorage.remove('crm_tho_email'); setUser(null); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Salir</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowLoginModal(true)} className="px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium">Ingresar</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation with sections */}
            <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4">
                    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-1">
                        {/* Dashboard */}
                        <button onClick={() => setActiveTab('dashboard')} className={`py-3 px-3 border-b-2 font-medium text-xs whitespace-nowrap flex-shrink-0 transition ${activeTab === 'dashboard' ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📊 Dashboard</button>
                        
                        {/* Separator */}
                        <span className="text-gray-300 dark:text-gray-600 mx-1 flex-shrink-0 hidden md:inline">|</span>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-bold flex-shrink-0 hidden md:inline mr-1">Comercial</span>
                        
                        {/* Comercial tabs */}
                        {[
                            { id: 'pipeline', nombre: '🎯 Pipeline' },
                            { id: 'tickets', nombre: '🎫 Tickets' },
                            { id: 'keyaccounts', nombre: '🔑 Key Accounts' },
                            { id: 'cerrados', nombre: '📜 Historial' },
                            { id: 'reportes', nombre: '📈 Reportes' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-3 px-3 border-b-2 font-medium text-xs whitespace-nowrap flex-shrink-0 transition ${activeTab === tab.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.nombre}</button>
                        ))}
                        
                        {/* Separator */}
                        <span className="text-gray-300 dark:text-gray-600 mx-1 flex-shrink-0 hidden md:inline">|</span>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-bold flex-shrink-0 hidden md:inline mr-1">Finanzas</span>
                        
                        {/* Finanzas tabs */}
                        {[
                            { id: 'finanzas-dashboard', nombre: '📋 Resumen', cTab: 'dashboard' },
                            { id: 'contabilidad', nombre: '📊 EERR', cTab: 'pl' },
                            { id: 'conciliacion', nombre: '🏦 Conciliación', cTab: 'conciliacion' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setContaTab(tab.cTab); }} className={`py-3 px-3 border-b-2 font-medium text-xs whitespace-nowrap flex-shrink-0 transition ${activeTab === tab.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.nombre}</button>
                        ))}
                        
                        {/* Spacer + Global Search */}
                        <div className="flex-1"></div>
                        <button onClick={() => setShowGlobalSearch(!showGlobalSearch)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition" title="Búsqueda global">🔍</button>
                    </nav>
                </div>
            </div>

            {/* Global Search Bar */}
            {showGlobalSearch && (
                <div className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 py-3">
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Buscar en prospectos, tickets, key accounts, historial..." 
                                value={globalSearch} 
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                className="w-full px-4 py-2.5 pl-10 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-naranja"
                                autoFocus
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            {globalSearch && (
                                <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
                            )}
                        </div>
                        {globalSearch.length >= 2 && (() => {
                            const q = globalSearch.toLowerCase();
                            const results = [
                                ...prospectos.filter(p => (p.organizacion||'').toLowerCase().includes(q) || (p.contacto||'').toLowerCase().includes(q) || (p.notas||'').toLowerCase().includes(q)).map(p => ({ type: 'prospecto', label: p.organizacion, sub: `${p.estado} · ${p.valor || 0} UF`, tab: 'pipeline', item: p })),
                                ...tickets.filter(t => (t.ticket||'').toLowerCase().includes(q) || (t.organizacion||'').toLowerCase().includes(q)).map(t => ({ type: 'ticket', label: t.ticket, sub: `${t.organizacion} · ${t.porcentaje_avance || 0}%`, tab: 'tickets', item: t })),
                                ...keyAccounts.filter(k => (k.organizacion||'').toLowerCase().includes(q) || (k.servicio||'').toLowerCase().includes(q)).map(k => ({ type: 'keyaccount', label: `${k.organizacion} · ${k.servicio}`, sub: `${k.uf_mes || 0} UF/mes`, tab: 'keyaccounts', item: k })),
                                ...cerrados.filter(c => (c.organizacion||'').toLowerCase().includes(q) || (c.contacto||'').toLowerCase().includes(q)).map(c => ({ type: 'cerrado', label: c.organizacion, sub: `${c.estado_final} · ${c.valor_total_final || 0} UF`, tab: 'cerrados', item: c })),
                            ].slice(0, 8);
                            const typeIcon = { prospecto: '🎯', ticket: '🎫', keyaccount: '🔑', cerrado: '📜' };
                            return results.length > 0 ? (
                                <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 overflow-hidden">
                                    {results.map((r, i) => (
                                        <button key={`${r.type}-${r.item?.id ?? i}`} onClick={() => { setActiveTab(r.tab); setGlobalSearch(''); setShowGlobalSearch(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-b dark:border-gray-700 last:border-0 transition">
                                            <span>{typeIcon[r.type]}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.label}</div>
                                                <div className="text-xs text-gray-500">{r.sub}</div>
                                            </div>
                                            <span className="text-[10px] text-gray-400 uppercase">{r.type}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-2 text-sm text-gray-400 text-center py-3">Sin resultados para "{globalSearch}"</div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Breadcrumb */}
            <div className="max-w-7xl mx-auto px-4 pt-3">
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                    <span>CRM</span>
                    <span>›</span>
                    <span>{['pipeline','tickets','keyaccounts','cerrados','reportes'].includes(activeTab) ? 'Comercial' : ['contabilidad','finanzas-dashboard','conciliacion'].includes(activeTab) ? 'Finanzas' : 'General'}</span>
                    <span>›</span>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">
                        {{ dashboard: 'Dashboard', pipeline: 'Pipeline', tickets: 'Tickets', keyaccounts: 'Key Accounts', cerrados: 'Historial', reportes: 'Reportes', 'finanzas-dashboard': 'Dashboard Financiero', contabilidad: 'Estado de Resultados', conciliacion: 'Conciliación Bancaria' }[activeTab]}
                    </span>
                </div>
                {['cerrados', 'tickets', 'keyaccounts', 'reportes', 'finanzas-dashboard', 'conciliacion', 'contabilidad'].includes(activeTab) && (
                    <DateRangeFilter desde={dateRange.desde} hasta={dateRange.hasta} onChange={setDateRange} className="mt-2" />
                )}
            </div>

            {activeTab === 'pipeline' && (
                <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 py-3">
                        <div className="flex space-x-4">
                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" aria-label="Buscar prospectos" />
                            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="px-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100" aria-label="Filtrar por tipo">
                                <option value="todos">Todos</option>
                                <option value="Ticket">Tickets</option>
                                <option value="Key Account">Key Accounts</option>
                            </select>
                            {(searchTerm || filterTipo !== 'todos') && (
                                <button onClick={() => { setSearchTerm(''); setFilterTipo('todos'); }} className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Limpiar filtros</button>
                            )}
                        </div>
                        {(searchTerm || filterTipo !== 'todos') && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Mostrando {filteredProspectos.length} de {prospectos.length} prospectos
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main className="max-w-7xl mx-auto px-3 py-4 md:px-4 md:py-8">
                {coreLoading ? <TabLoader /> : (
                <Suspense fallback={<TabLoader />}>
                {activeTab === 'dashboard' && <Dashboard metrics={metrics} prospectos={prospectos} cerrados={cerrados} tickets={activeTickets} keyAccounts={activeKeyAccounts} user={user} ufActual={ufActual} monedaPreferida={monedaPreferida} setMonedaPreferida={setMonedaPreferida} actividadReciente={actividadReciente} />}
                {activeTab === 'pipeline' && <KanbanBoard onDetail={(p) => openDetail('prospecto', p)} onConvert={openConvert} onHistory={openHistory} estados={estadosKanban} prospectosPorEstado={prospectosPorEstadoFiltrado} onEdit={(p) => { if (requireAuth()) { setEditingItem(p); setModalType('prospecto'); setShowModal(true); }}} onDelete={handleDeleteProspecto} onMove={handleMoveProspecto} onCerrar={handleCerrarProspecto} getEstadoFromKey={getEstadoFromKey} />}
                {activeTab === 'reportes' && <ReportesView prospectos={prospectos} cerrados={filteredCerrados} tickets={filteredTickets} keyAccounts={filteredKeyAccounts} ufActual={ufActual} dateRange={dateRange} />}
                {['finanzas-dashboard', 'contabilidad', 'conciliacion'].includes(activeTab) && (
                    financeLoading ? <TabLoader /> :
                    <ContabilidadView
                        facturasEmitidas={facturasEmitidas}
                        facturasRecibidas={facturasRecibidas} 
                        cajaChica={cajaChica} 
                        boletasHonorarios={boletasHonorarios} 
                        sueldosSocios={sueldosSocios} 
                        dateRange={dateRange} 
                        movimientosBancarios={movimientosBancarios} 
                        tickets={tickets} 
                        keyAccounts={keyAccounts} 
                        ufActual={ufActual} 
                        contaTab={contaTab} 
                        setContaTab={setContaTab} 
                        monedaPreferida={monedaPreferida} 
                        alertasValidacion={alertasValidacion}
                        setAlertasValidacion={setAlertasValidacion}
                        importarBoletasExcel={importarBoletasExcel}
                        importarFacturasEmitidasExcel={importarFacturasEmitidasExcel}
                        importarFacturasRecibidasExcel={importarFacturasRecibidasExcel}
                        importarCartola={importarCartola}
                        buscarMatches={buscarMatches} 
                        aplicarConciliacion={aplicarConciliacion} 
                        crearGastoCajaChica={crearGastoCajaChica} 
                        ignorarMovimiento={ignorarMovimiento} 
                        onReload={() => { 
                            loadFacturasEmitidas(); 
                            loadFacturasRecibidas(); 
                            loadCajaChica(); 
                            loadBoletasHonorarios(); 
                            loadSueldosSocios(); 
                            loadMovimientosBancarios(); 
                        }} 
                        onFiles={openFilesModal} 
                    />
                )}
                {activeTab === 'cerrados' && <CerradosView onDetail={(c) => openDetail('cerrado', c)} onConvertClosed={openConvertFromCerrado} onHistory={openHistory} onFiles={openFilesModal} cerrados={filteredCerrados} keyAccounts={activeKeyAccounts} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('cerrado'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('cerrado'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('cerrado', id)} onExport={() => exportToCSV(cerrados, 'cerrados.csv')} />}
                {activeTab === 'tickets' && <TicketsView onDetail={(t) => openDetail('ticket', t)} onClose={handleCloseTicket} onHistory={openHistory} onFiles={openFilesModal} tickets={filteredTickets} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('ticket'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('ticket'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('ticket', id)} onExport={() => exportToCSV(tickets, 'tickets.csv')} />}
                {activeTab === 'keyaccounts' && <KeyAccountsView ufActual={ufActual} onDetail={(k) => openDetail('keyaccount', k)} onHistory={openHistory} onRenew={openRenewal} onCancel={openCancelKA} onFiles={openFilesModal} keyAccounts={filteredKeyAccounts} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('keyaccount'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('keyaccount'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('keyaccount', id)} onExport={() => exportToCSV(filteredKeyAccounts, 'key-accounts.csv')} />}
                </Suspense>
                )}
            </main>

            {showModal && <UniversalModal type={modalType} item={editingItem} onSave={(data) => modalType === 'prospecto' ? handleSaveProspecto(data) : handleSaveOther(modalType, data)} onClose={() => setShowModal(false)} />}
            
            {historyOpen && <HistoryModal open={historyOpen} title={historyTitle} items={historyItems} loading={historyLoading} onClose={() => { setHistoryOpen(false); setHistoryItems([]); }} />}
            {filesModalOpen && <FilesModal open={filesModalOpen} onClose={() => setFilesModalOpen(false)} entityName={filesEntityName} files={filesList} loading={filesLoading} uploading={uploadingFile} onUpload={uploadFile} onDownload={downloadFile} onDelete={deleteFile} getIcon={getFileIcon} formatSize={formatFileSize} />}
            {convertOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeConvert}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Convertir prospecto</h3>
                                <p className="text-sm text-gray-600">{convertSource?.item?.organizacion}</p>
                            </div>
                            <button onClick={closeConvert} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">✕</button>
                        </div>

                        <div className="mt-4">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Destino</label>
                            <select value={convertTarget} onChange={(e) => setConvertTarget(e.target.value)} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                <option value="ticket">Ticket (ejecución)</option>
                                <option value="key_account">Key Account (contrato)</option>
                            </select>
                        </div>

                        {convertTarget === 'ticket' ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del ticket</label>
                                    <input value={convertForm.ticket} onChange={(e) => setConvertForm({...convertForm, ticket: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Inicio</label>
                                        <input type="date" value={convertForm.fecha_inicio} onChange={(e) => setConvertForm({...convertForm, fecha_inicio: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Entrega</label>
                                        <input type="date" value={convertForm.fecha_entrega} onChange={(e) => setConvertForm({...convertForm, fecha_entrega: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Responsable</label>
                                    <input value={convertForm.responsable} onChange={(e) => setConvertForm({...convertForm, responsable: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: Jere / Vale / ..." />
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Servicio</label>
                                    <input value={convertForm.servicio} onChange={(e) => setConvertForm({...convertForm, servicio: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">UF/mes</label>
                                        <input type="number" step="0.01" min="0" value={convertForm.uf_mes} onChange={(e) => setConvertForm({...convertForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fin contrato</label>
                                        <input type="date" value={convertForm.fin_contrato} onChange={(e) => setConvertForm({...convertForm, fin_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Inicio contrato</label>
                                    <input type="date" value={convertForm.inicio_contrato} onChange={(e) => setConvertForm({...convertForm, inicio_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end space-x-2">
                            <button onClick={closeConvert} className="px-4 py-2 rounded-lg border">Cancelar</button>
                            <button onClick={submitConvert} className="px-4 py-2 rounded-lg bg-azul text-white">Convertir</button>
                        </div>
                    </div>
                </div>
            )}

            {renewalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeRenewal}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{renewalMode === 'cancel' ? 'Cancelar contrato' : 'Renovar contrato'}</h3>
                                <p className="text-sm text-gray-600">{renewalKA?.organizacion}</p>
                            </div>
                            <button onClick={closeRenewal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">✕</button>
                        </div>

                        {renewalMode === 'cancel' ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Motivo de cancelación</label>
                                    <input value={renewalForm.cancel_reason} onChange={(e) => setRenewalForm({...renewalForm, cancel_reason: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: cliente pausó / cambio de foco / ..." />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</label>
                                    <textarea value={renewalForm.notes} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" rows="3" />
                                </div>

                                <div className="flex items-center space-x-2 pt-1">
                                    <input id="cancelAlsoRegisterLoss" type="checkbox" checked={cancelAlsoRegisterLoss} onChange={(e) => setCancelAlsoRegisterLoss(e.target.checked)} />
                                    <label htmlFor="cancelAlsoRegisterLoss" className="text-sm text-gray-700">
                                        Registrar esta pérdida también en <span className="font-medium">Historial</span>
                                    </label>
                                </div>

                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Inicio</label>
                                        <input type="date" value={renewalForm.start_date} onChange={(e) => setRenewalForm({...renewalForm, start_date: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fin</label>
                                        <input type="date" value={renewalForm.end_date} onChange={(e) => setRenewalForm({...renewalForm, end_date: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">UF/mes</label>
                                    <input type="number" step="0.01" min="0" value={renewalForm.uf_mes} onChange={(e) => setRenewalForm({...renewalForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</label>
                                    <textarea value={renewalForm.notes} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" rows="3" />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end space-x-2">
                            <button onClick={closeRenewal} className="px-4 py-2 rounded-lg border">Cerrar</button>
                            <button onClick={submitRenewal} className={`px-4 py-2 rounded-lg text-white ${renewalMode === 'cancel' ? 'bg-red-600' : 'bg-verde'}`}>
                                {renewalMode === 'cancel' ? 'Confirmar cancelación' : 'Confirmar renovación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
            {selectedEntity && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><TabLoader /></div>}>
                    <EntityDetail entity={selectedEntity} onClose={() => setSelectedEntity(null)} contactos={contactos} notas={notas} user={user} keyAccounts={keyAccounts} ufActual={ufActual} onRefresh={() => { loadNotas(); loadContactos(); loadProspectos(); loadCerrados(); loadTickets(); loadKeyAccounts(); }} />
                </Suspense>
            )}
        </div>
    );
}

export default CRMApp
