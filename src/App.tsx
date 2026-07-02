import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { supabase } from './utils/supabase'
import { formatFileSize, normalizeSearch } from './utils/formatters'
import {
    LayoutDashboard, Target, Ticket as TicketIcon, KeyRound, History, TrendingUp,
    ClipboardList, BarChart3, Landmark, Search, Sun, Moon, Plus, Download,
    Menu, X, ChevronsLeft, ChevronsRight, LogOut
} from 'lucide-react'

// Modales y utilidades — eager: son chicos y se renderizan condicionalmente.
import LoginModal from './components/Modals/LoginModal'
import UniversalModal from './components/Modals/UniversalModal'
import CloseTicketModal from './components/Modals/CloseTicketModal'
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
const OrgDetail = lazy(() => import('./components/OrgDetail/OrgDetail'))

import useData from './hooks/useData'
import useCRMActions from './hooks/useCRMActions'
import useFinanzas from './hooks/useFinanzas'
import useMetrics from './hooks/useMetrics'
import useExcelImport from './hooks/useExcelImport'

// Fallback mientras carga el chunk de una pestaña lazy-loaded.
function TabLoader() {
    return (
        <div className="px-1 py-2">
            <div className="skeleton skeleton-title"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card hidden md:block"></div>
                <div className="skeleton skeleton-card hidden md:block"></div>
            </div>
            <div className="skeleton skeleton-text w-2/3 mt-4"></div>
            <div className="skeleton skeleton-text w-1/2"></div>
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

// localStorage seguro (Safari modo privado puede tirar QuotaExceededError)
const safeStorage = {
    get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
    set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* silencio */ } },
    remove(key: string): void { try { localStorage.removeItem(key); } catch { /* silencio */ } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportToCSV(data: any[], filename = 'export.csv'): void {
    if (!data || data.length === 0) return;
    const excludeFields = ['id', 'created_at', 'created_by_email', 'updated_at'];
    // Union de todas las keys — evita perder columnas que aparezcan recién en items 2+
    const allKeys = new Set<string>();
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
            let str = String(val);
            // Anti CSV-injection: celdas que empiezan con =, @, tab o +/- no numérico
            // se prefijan con ' para que Excel no las ejecute como fórmula.
            if (/^[=@\t\r]/.test(str) || (/^[+-]/.test(str) && !/^[+-]?\d*\.?\d+$/.test(str))) {
                str = "'" + str;
            }
            return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        }).join(','))
    ].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Timestamp completo para evitar overwrites en el mismo día
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = filename.replace(/\.csv$/i, '') + `-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

interface AppUser {
    email: string
    name: string
}

interface DateRange {
    desde: string
    hasta: string
}

interface GlobalSearchResult {
    type: 'prospecto' | 'ticket' | 'keyaccount' | 'cerrado'
    label: string
    sub: string
    tab: string
    item: Record<string, unknown>
}

// ===== NAVEGACIÓN =====
interface NavItem {
    id: string
    nombre: string
    icon: typeof LayoutDashboard
    cTab?: string
}

interface NavSection {
    label: string | null
    items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
    {
        label: null,
        items: [{ id: 'dashboard', nombre: 'Dashboard', icon: LayoutDashboard }]
    },
    {
        label: 'Comercial',
        items: [
            { id: 'pipeline', nombre: 'Pipeline', icon: Target },
            { id: 'tickets', nombre: 'Tickets', icon: TicketIcon },
            { id: 'keyaccounts', nombre: 'Key Accounts', icon: KeyRound },
            { id: 'cerrados', nombre: 'Historial', icon: History },
            { id: 'reportes', nombre: 'Reportes', icon: TrendingUp },
        ]
    },
    {
        label: 'Finanzas',
        items: [
            { id: 'finanzas-dashboard', nombre: 'Resumen', icon: ClipboardList, cTab: 'dashboard' },
            { id: 'contabilidad', nombre: 'EERR', icon: BarChart3, cTab: 'pl' },
            { id: 'conciliacion', nombre: 'Conciliación', icon: Landmark, cTab: 'conciliacion' },
        ]
    },
]

const TAB_TITLES: Record<string, string> = {
    dashboard: 'Dashboard', pipeline: 'Pipeline', tickets: 'Tickets', keyaccounts: 'Key Accounts',
    cerrados: 'Historial', reportes: 'Reportes', 'finanzas-dashboard': 'Dashboard Financiero',
    contabilidad: 'Estado de Resultados', conciliacion: 'Conciliación Bancaria'
}

function CRMApp() {
    // ===== AUTH =====
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [showLoginModal, setShowLoginModal] = useState(false);

    useEffect(() => {
        // Única fuente de verdad de sesión: Supabase OAuth. Se eliminó el fallback
        // a localStorage ('crm_tho_email') — mostraba al usuario como conectado
        // sin sesión real, y cada escritura fallaba silenciosamente por RLS.
        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const email = session.user.email || '';
                    const namePart = email.includes('@') ? email.split('@')[0] : email;
                    const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || namePart;
                    setUser({ email, name });
                }
            } catch (e) {
                console.warn('OAuth session check failed:', e);
            }
            setLoading(false);
        };
        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const email = session.user.email || '';
                const namePart = email.includes('@') ? email.split('@')[0] : email;
                const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || namePart;
                setUser({ email, name });
                setShowLoginModal(false);
            }
            if (event === 'SIGNED_OUT') setUser(null);
        });
        // Limpieza del email legacy que dejaba el fallback antiguo
        safeStorage.remove('crm_tho_email');
        return () => subscription.unsubscribe();
    }, []);

    // handleLogin se eliminó al cerrar las RLS — el único path de login válido
    // ahora es Microsoft OAuth, que se procesa vía supabase.auth.onAuthStateChange
    // arriba (evento 'SIGNED_IN') y setea el user automáticamente.

    const requireAuth = (): boolean => {
        if (!user) { setShowLoginModal(true); return false; }
        return true;
    };

    // ===== DATA HOOK =====
    const data = useData(user);
    const { prospectos, cerrados, tickets, keyAccounts, contactos, notas, actividadReciente,
        facturasEmitidas, facturasRecibidas, cajaChica, boletasHonorarios, sueldosSocios,
        movimientosBancarios, liquidaciones, ufActual,
        loadProspectos, loadCerrados, loadTickets, loadKeyAccounts, loadContactos, loadNotas,
        loadActividad, loadFacturasEmitidas, loadFacturasRecibidas,
        loadCajaChica, loadBoletasHonorarios, loadSueldosSocios, loadMovimientosBancarios, loadLiquidaciones,
        setFacturasEmitidas, setFacturasRecibidas, setCajaChica, setBoletasHonorarios,
        setSueldosSocios, setMovimientosBancarios,
        coreLoading, financeLoading, ensureFinanceData } = data;

    // Suprimir advertencias de vars declaradas en el hook pero no usadas directamente en este componente
    void setFacturasEmitidas; void setFacturasRecibidas; void setCajaChica;
    void setBoletasHonorarios; void setSueldosSocios; void setMovimientosBancarios;
    void loadActividad; void loadLiquidaciones;

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
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);

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
        facturasEmitidas, facturasRecibidas, boletasHonorarios, liquidaciones, sueldosSocios, cajaChica,
        ufActual,
        loadMovimientosBancarios, loadCajaChica,
        loadFacturasEmitidas, loadFacturasRecibidas, loadBoletasHonorarios, loadSueldosSocios, loadLiquidaciones
    });

    // ===== UI STATE =====
    const [activeTab, setActiveTab] = useState('dashboard');
    const [dateRange, setDateRange] = useState<DateRange>({ desde: '', hasta: '' });
    // showModal/setShowModal se declara arriba (antes de useCRMActions) — ver comentario allá.
    const [modalType, setModalType] = useState<'prospecto' | 'cerrado' | 'ticket' | 'keyaccount'>('prospecto');
    // editingItem/setEditingItem se declara arriba (antes de useCRMActions) — ver comentario allá.
    const [searchTerm, setSearchTerm] = useState('');
    const [globalSearch, setGlobalSearch] = useState('');
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);
    const [paletteIndex, setPaletteIndex] = useState(0);
    const [filterTipo, setFilterTipo] = useState('todos');
    const [monedaPreferida, setMonedaPreferida] = useState<'UF' | 'CLP'>(() => (safeStorage.get('monedaPreferida') as 'UF' | 'CLP') || 'CLP');
    const [contaTab, setContaTab] = useState('dashboard');
    const [alertasValidacion, setAlertasValidacion] = useState<{ tipo: 'error' | 'warning' | 'info'; mensaje: string }[]>([]);
    const [darkMode, setDarkMode] = useState<boolean>(() => safeStorage.get('darkMode') === 'true');
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => safeStorage.get('sidebarCollapsed') === 'true');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const paletteInputRef = useRef<HTMLInputElement>(null);

    // Persistir moneda preferida
    useEffect(() => { safeStorage.set('monedaPreferida', monedaPreferida); }, [monedaPreferida]);

    // Persistir estado del sidebar
    useEffect(() => { safeStorage.set('sidebarCollapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);

    // Dark mode
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', darkMode);
        safeStorage.set('darkMode', String(darkMode));
    }, [darkMode]);

    // Carga diferida de datos financieros: la primera vez que el usuario abre
    // una pestaña de Finanzas, se disparan las queries de facturas/boletas/etc.
    useEffect(() => {
        if (FINANCE_TABS.includes(activeTab)) ensureFinanceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, ensureFinanceData]);

    // Cmd+K search — usamos updater functions y un guard para evitar reinstalar el
    // listener en cada cambio de showGlobalSearch.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
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

    // Reset índice del palette cuando cambia la query
    useEffect(() => { setPaletteIndex(0); }, [globalSearch]);

    // Autofocus al abrir el palette
    useEffect(() => {
        if (showGlobalSearch) setTimeout(() => paletteInputRef.current?.focus(), 30);
    }, [showGlobalSearch]);

    // Date range filter — extrae sólo la parte ISO (YYYY-MM-DD) por si la fecha de DB viene con timestamp.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterByDateRange = <T = any>(items: T[], dateField: string): T[] => {
        if (!dateRange.desde && !dateRange.hasta) return items;
        return items.filter(item => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (item as any)[dateField];
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
    const filteredProspectos = useMemo(() => {
        const q = normalizeSearch((searchTerm || '').trim());
        return prospectos.filter(p => {
            if (filterTipo !== 'todos' && !(p.tipo || '').startsWith(filterTipo)) return false;
            if (!q) return true;
            return (
                normalizeSearch(p.organizacion).includes(q) ||
                normalizeSearch(p.contacto).includes(q) ||
                normalizeSearch(p.notas).includes(q) ||
                normalizeSearch(p.proximo_paso).includes(q)
            );
        });
    }, [prospectos, searchTerm, filterTipo]);

    const prospectosPorEstadoFiltrado = (estadoId: string) => prospectosPorEstado(estadoId, filteredProspectos);

    // Resultados de búsqueda global (para el command palette)
    const paletteResults = useMemo((): GlobalSearchResult[] => {
        if (globalSearch.length < 2) return [];
        const q = normalizeSearch(globalSearch);
        const has = (s: string | null | undefined) => normalizeSearch(s).includes(q);
        return [
            ...prospectos.filter(p => has(p.organizacion) || has(p.contacto) || has(p.notas)).map(p => ({ type: 'prospecto' as const, label: p.organizacion as string, sub: `${p.estado} · ${p.valor || 0} UF`, tab: 'pipeline', item: p as unknown as Record<string, unknown> })),
            ...tickets.filter(t => has(t.ticket) || has(t.organizacion)).map(t => ({ type: 'ticket' as const, label: t.ticket as string, sub: `${t.organizacion} · ${t.porcentaje_avance || 0}%`, tab: 'tickets', item: t as unknown as Record<string, unknown> })),
            ...keyAccounts.filter(k => has(k.organizacion) || has(k.servicio)).map(k => ({ type: 'keyaccount' as const, label: `${k.organizacion} · ${k.servicio}`, sub: `${k.uf_mes || 0} UF/mes`, tab: 'keyaccounts', item: k as unknown as Record<string, unknown> })),
            ...cerrados.filter(c => has(c.organizacion) || has(c.contacto)).map(c => ({ type: 'cerrado' as const, label: c.organizacion as string, sub: `${c.estado_final} · ${c.valor_total_final || 0} UF`, tab: 'cerrados', item: c as unknown as Record<string, unknown> })),
        ].slice(0, 8);
    }, [globalSearch, prospectos, tickets, keyAccounts, cerrados]);

    const selectPaletteResult = (r: GlobalSearchResult) => {
        setActiveTab(r.tab);
        setGlobalSearch('');
        setShowGlobalSearch(false);
    };

    // Destructure actions for render convenience
    const { historyOpen, historyLoading, historyTitle, historyItems, setHistoryItems, openHistory, setHistoryOpen,
        convertOpen, convertSource, convertTarget, convertForm, openConvert, openConvertFromCerrado, closeConvert, setConvertTarget, setConvertForm, submitConvert,
        renewalOpen, renewalKA, renewalMode, renewalForm, cancelAlsoRegisterLoss, openRenewal, openCancelKA, closeRenewal, setRenewalForm, setCancelAlsoRegisterLoss, submitRenewal,
        filesModalOpen, filesEntityName, filesList, filesLoading, uploadingFile, openFilesModal, setFilesModalOpen,
        closeTicketOpen, closeTicketTarget, closeCloseTicketModal, submitCloseTicket,
        selectedEntity, openDetail, setSelectedEntity,
        handleSaveProspecto, handleDeleteProspecto, handleMoveProspecto, handleCerrarProspecto,
        handleSaveOther, handleDeleteOther, handleCloseTicket,
        uploadFile, downloadFile, deleteFile, getFileIcon } = actions;

    const [orgDetailOrg, setOrgDetailOrg] = useState<string | null>(null)
    const openOrgDetail = (org: string) => setOrgDetailOrg(org)

    const { importarCartola, buscarMatches, aplicarConciliacion, crearGastoCajaChica, ignorarMovimiento } = finanzas;

    // ESC para los modales inline (Convertir / Renovar). Va DESPUÉS del destructuring
    // de `actions` porque `closeConvert/closeRenewal/convertOpen/renewalOpen` se
    // declaran ahí — si lo movemos arriba, TDZ en runtime.
    useEscapeKey(closeConvert, convertOpen);
    useEscapeKey(closeRenewal, renewalOpen);

    const navigate = (item: NavItem) => {
        setActiveTab(item.id);
        if (item.cTab) setContaTab(item.cTab);
        setMobileNavOpen(false);
    };

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

    const sidebarNav = (collapsed: boolean) => (
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
            {NAV_SECTIONS.map((section, si) => (
                <div key={si}>
                    {section.label && !collapsed && <div className="sidebar-section">{section.label}</div>}
                    {section.label && collapsed && <div className="border-t border-gray-200 dark:border-gray-700 my-2 mx-1"></div>}
                    {section.items.map(item => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => navigate(item)}
                                className={`sidebar-item ${active ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
                                title={collapsed ? item.nombre : undefined}
                            >
                                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
                                {!collapsed && <span className="truncate">{item.nombre}</span>}
                            </button>
                        );
                    })}
                </div>
            ))}
        </nav>
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex">
            {/* ===== SIDEBAR (desktop) ===== */}
            <aside className={`hidden md:flex flex-col flex-shrink-0 sticky top-0 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
                <div className={`flex items-center gap-2.5 px-4 py-4 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
                    <img src="/logo-tho.png" alt="THO" className="h-8 w-8 object-contain dark:brightness-0 dark:invert flex-shrink-0" />
                    {!sidebarCollapsed && (
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">CRM</div>
                            <div className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-tight truncate">The Human Org</div>
                        </div>
                    )}
                </div>

                {sidebarNav(sidebarCollapsed)}

                <div className="px-2 pb-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                    <button onClick={() => setShowGlobalSearch(true)} className={`sidebar-item ${sidebarCollapsed ? 'justify-center' : ''}`} title="Búsqueda global (⌘K)">
                        <Search size={16} strokeWidth={1.8} className="flex-shrink-0" />
                        {!sidebarCollapsed && (
                            <>
                                <span>Buscar</span>
                                <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-400">⌘K</kbd>
                            </>
                        )}
                    </button>
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`sidebar-item ${sidebarCollapsed ? 'justify-center' : ''}`} title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}>
                        {sidebarCollapsed ? <ChevronsRight size={16} strokeWidth={1.8} /> : <ChevronsLeft size={16} strokeWidth={1.8} className="flex-shrink-0" />}
                        {!sidebarCollapsed && <span>Colapsar</span>}
                    </button>
                </div>
            </aside>

            {/* ===== DRAWER (móvil) ===== */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileNavOpen(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                    <div className="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-800 shadow-xl flex flex-col animate-fadeIn" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-4">
                            <div className="flex items-center gap-2.5">
                                <img src="/logo-tho.png" alt="THO" className="h-8 w-8 object-contain dark:brightness-0 dark:invert" />
                                <div className="text-sm font-bold text-gray-800 dark:text-gray-100">CRM</div>
                            </div>
                            <button onClick={() => setMobileNavOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600" aria-label="Cerrar menú"><X size={18} /></button>
                        </div>
                        {sidebarNav(false)}
                    </div>
                </div>
            )}

            {/* ===== CONTENIDO ===== */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Topbar */}
                <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors">
                    <div className="px-3 md:px-6 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label="Abrir menú"><Menu size={20} /></button>
                            <h1 className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{TAB_TITLES[activeTab]}</h1>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                            <div className="hidden lg:flex items-center text-xs text-gray-500 dark:text-gray-400 tnum">
                                UF ${ufActual.toLocaleString('es-CL')}
                            </div>
                            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                                {(['UF', 'CLP'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMonedaPreferida(m)}
                                        className={`px-2 py-1 text-xs font-medium rounded transition ${
                                            monedaPreferida === m
                                                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                                                : 'text-gray-500 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title={darkMode ? 'Modo claro' : 'Modo oscuro'}
                                aria-label={darkMode ? 'Modo claro' : 'Modo oscuro'}
                            >
                                {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                            {user && (
                                <>
                                    <button onClick={() => { setEditingItem(null); setModalType('prospecto'); setShowModal(true); }} className="flex items-center gap-1 px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium whitespace-nowrap">
                                        <Plus size={15} strokeWidth={2.4} /> <span className="hidden sm:inline">Prospecto</span>
                                    </button>
                                    <button onClick={() => exportToCSV(filteredProspectos, 'pipeline.csv')} className="hidden md:inline-flex p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Exportar pipeline (respeta filtros)" aria-label="Exportar pipeline">
                                        <Download size={16} />
                                    </button>
                                </>
                            )}
                            <div className="text-sm">
                                {user ? (
                                    <div className="flex items-center gap-2">
                                        <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400">{user.email.split('@')[0]}</span>
                                        <button onClick={async () => { await supabase.auth.signOut(); setUser(null); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Salir" aria-label="Salir">
                                            <LogOut size={15} />
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowLoginModal(true)} className="px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium">Ingresar</button>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Filtro de fechas contextual */}
                {['cerrados', 'tickets', 'keyaccounts', 'reportes', 'finanzas-dashboard', 'conciliacion', 'contabilidad'].includes(activeTab) && (
                    <div className="px-3 md:px-6 pt-3">
                        <DateRangeFilter desde={dateRange.desde} hasta={dateRange.hasta} onChange={setDateRange} />
                    </div>
                )}

                {/* Filtros del pipeline */}
                {activeTab === 'pipeline' && (
                    <div className="px-3 md:px-6 pt-3">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input type="text" placeholder="Buscar prospectos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" aria-label="Buscar prospectos" />
                            </div>
                            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" aria-label="Filtrar por tipo">
                                <option value="todos">Todos</option>
                                <option value="Ticket">Tickets</option>
                                <option value="Key Account">Key Accounts</option>
                            </select>
                            {(searchTerm || filterTipo !== 'todos') && (
                                <button onClick={() => { setSearchTerm(''); setFilterTipo('todos'); }} className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap">Limpiar</button>
                            )}
                        </div>
                        {(searchTerm || filterTipo !== 'todos') && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Mostrando {filteredProspectos.length} de {prospectos.length} prospectos
                            </div>
                        )}
                    </div>
                )}

                <main className="flex-1 px-3 py-4 md:px-6 md:py-6">
                    {coreLoading ? <TabLoader /> : (
                    <Suspense fallback={<TabLoader />}>
                    {activeTab === 'dashboard' && <Dashboard metrics={metrics} prospectos={prospectos} cerrados={cerrados} tickets={activeTickets} keyAccounts={activeKeyAccounts} user={user} ufActual={ufActual} monedaPreferida={monedaPreferida} setMonedaPreferida={(m: string) => setMonedaPreferida(m as 'UF' | 'CLP')} actividadReciente={actividadReciente} />}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {activeTab === 'pipeline' && <KanbanBoard onDetail={(p) => openDetail('prospecto', p)} onConvert={openConvert} onHistory={openHistory} estados={estadosKanban} prospectosPorEstado={prospectosPorEstadoFiltrado} onEdit={(p) => { if (requireAuth()) { setEditingItem(p as unknown as Record<string, unknown>); setModalType('prospecto'); setShowModal(true); }}} onDelete={handleDeleteProspecto} onMove={handleMoveProspecto} onCerrar={handleCerrarProspecto} getEstadoFromKey={getEstadoFromKey} />}
                    {activeTab === 'reportes' && <ReportesView prospectos={prospectos} cerrados={filteredCerrados} tickets={filteredTickets} keyAccounts={filteredKeyAccounts} ufActual={ufActual} dateRange={dateRange} />}
                    {['finanzas-dashboard', 'contabilidad', 'conciliacion'].includes(activeTab) && (
                        financeLoading ? <TabLoader /> :
                        <ContabilidadView
                            facturasEmitidas={facturasEmitidas}
                            facturasRecibidas={facturasRecibidas}
                            cajaChica={cajaChica}
                            boletasHonorarios={boletasHonorarios}
                            liquidaciones={liquidaciones}
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
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {activeTab === 'cerrados' && <CerradosView onDetail={(c) => openDetail('cerrado', c)} onConvertClosed={openConvertFromCerrado} onHistory={openHistory} onFiles={openFilesModal} cerrados={filteredCerrados} keyAccounts={activeKeyAccounts} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('cerrado'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item as unknown as Record<string, unknown>); setModalType('cerrado'); setShowModal(true); }}} onDelete={(id: string) => handleDeleteOther('cerrado', id)} onExport={() => exportToCSV(cerrados, 'cerrados.csv')} />}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {activeTab === 'tickets' && <TicketsView onOrgDetail={openOrgDetail} onDetail={(t) => openDetail('ticket', t)} onClose={handleCloseTicket} onHistory={openHistory} onFiles={openFilesModal} tickets={filteredTickets} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('ticket'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item as unknown as Record<string, unknown>); setModalType('ticket'); setShowModal(true); }}} onDelete={(id: string) => handleDeleteOther('ticket', id)} onExport={() => exportToCSV(tickets, 'tickets.csv')} />}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {activeTab === 'keyaccounts' && <KeyAccountsView ufActual={ufActual} onOrgDetail={openOrgDetail} onDetail={(k) => openDetail('keyaccount', k)} onHistory={openHistory} onRenew={openRenewal} onCancel={openCancelKA} onFiles={openFilesModal} keyAccounts={filteredKeyAccounts} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('keyaccount'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item as unknown as Record<string, unknown>); setModalType('keyaccount'); setShowModal(true); }}} onDelete={(id: string) => handleDeleteOther('keyaccount', id)} onExport={() => exportToCSV(filteredKeyAccounts, 'key-accounts.csv')} />}
                    </Suspense>
                    )}
                </main>
            </div>

            {/* ===== COMMAND PALETTE (⌘K) ===== */}
            {showGlobalSearch && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={() => { setShowGlobalSearch(false); setGlobalSearch(''); }}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                    <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                            <Search size={17} className="text-gray-400 flex-shrink-0" />
                            <input
                                ref={paletteInputRef}
                                type="text"
                                placeholder="Buscar en prospectos, tickets, key accounts, historial..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(i => Math.min(i + 1, paletteResults.length - 1)); }
                                    if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(i => Math.max(i - 1, 0)); }
                                    if (e.key === 'Enter' && paletteResults[paletteIndex]) { e.preventDefault(); selectPaletteResult(paletteResults[paletteIndex]); }
                                }}
                                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 border-0 focus:ring-0"
                                style={{ boxShadow: 'none' }}
                            />
                            <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-400 flex-shrink-0">esc</kbd>
                        </div>
                        {globalSearch.length >= 2 && (
                            paletteResults.length > 0 ? (
                                <div className="max-h-80 overflow-y-auto py-1">
                                    {paletteResults.map((r, i) => {
                                        const TypeIcon = { prospecto: Target, ticket: TicketIcon, keyaccount: KeyRound, cerrado: History }[r.type];
                                        return (
                                            <button
                                                key={`${r.type}-${(r.item?.id as string) ?? i}`}
                                                onClick={() => selectPaletteResult(r)}
                                                onMouseEnter={() => setPaletteIndex(i)}
                                                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition ${i === paletteIndex ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                            >
                                                <TypeIcon size={15} className="text-gray-400 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.label}</div>
                                                    <div className="text-xs text-gray-500 truncate">{r.sub}</div>
                                                </div>
                                                <span className="text-[10px] text-gray-400 uppercase flex-shrink-0">{r.type}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-400 text-center py-6">Sin resultados para &quot;{globalSearch}&quot;</div>
                            )
                        )}
                        {globalSearch.length < 2 && (
                            <div className="text-xs text-gray-400 text-center py-6">Escribe al menos 2 caracteres · ↑↓ para navegar · Enter para abrir</div>
                        )}
                    </div>
                </div>
            )}

            {showModal && <UniversalModal type={modalType} item={editingItem} ufActual={ufActual} onSave={(d) => modalType === 'prospecto' ? handleSaveProspecto(d) : handleSaveOther(modalType, d)} onClose={() => setShowModal(false)} />}

            {historyOpen && <HistoryModal open={historyOpen} title={historyTitle} items={historyItems} loading={historyLoading} onClose={() => { setHistoryOpen(false); setHistoryItems([]); }} />}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {filesModalOpen && <FilesModal open={filesModalOpen} onClose={() => setFilesModalOpen(false)} entityName={filesEntityName} files={filesList as any} loading={filesLoading} uploading={uploadingFile} onUpload={uploadFile} onDownload={downloadFile} onDelete={deleteFile} getIcon={getFileIcon} formatSize={formatFileSize} />}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {closeTicketOpen && <CloseTicketModal ticket={closeTicketTarget as any} onSubmit={submitCloseTicket} onClose={closeCloseTicketModal} />}
            {convertOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeConvert}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slideUp" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Convertir prospecto</h3>
                                <p className="text-sm text-gray-600">{(convertSource?.item as Record<string, unknown>)?.organizacion as string}</p>
                            </div>
                            <button onClick={closeConvert} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" aria-label="Cerrar"><X size={18} /></button>
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
                                    <input value={convertForm.ticket || ''} onChange={(e) => setConvertForm({...convertForm, ticket: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Inicio</label>
                                        <input type="date" value={convertForm.fecha_inicio || ''} onChange={(e) => setConvertForm({...convertForm, fecha_inicio: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Entrega</label>
                                        <input type="date" value={convertForm.fecha_entrega || ''} onChange={(e) => setConvertForm({...convertForm, fecha_entrega: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Responsable</label>
                                    <input value={convertForm.responsable || ''} onChange={(e) => setConvertForm({...convertForm, responsable: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: Jere / Vale / ..." />
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Servicio</label>
                                    <input value={convertForm.servicio || ''} onChange={(e) => setConvertForm({...convertForm, servicio: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">UF/mes</label>
                                        <input type="number" step="0.01" min="0" value={convertForm.uf_mes || ''} onChange={(e) => setConvertForm({...convertForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fin contrato</label>
                                        <input type="date" value={convertForm.fin_contrato || ''} onChange={(e) => setConvertForm({...convertForm, fin_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Inicio contrato</label>
                                    <input type="date" value={convertForm.inicio_contrato || ''} onChange={(e) => setConvertForm({...convertForm, inicio_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end space-x-2">
                            <button onClick={closeConvert} className="px-4 py-2 rounded-lg border">Cancelar</button>
                            <button onClick={submitConvert} className="px-4 py-2 rounded-lg color-naranja text-white font-medium">Convertir</button>
                        </div>
                    </div>
                </div>
            )}

            {renewalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeRenewal}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slideUp" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{renewalMode === 'cancel' ? 'Cancelar contrato' : 'Renovar contrato'}</h3>
                                <p className="text-sm text-gray-600">{(renewalKA as Record<string, unknown>)?.organizacion as string}</p>
                            </div>
                            <button onClick={closeRenewal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" aria-label="Cerrar"><X size={18} /></button>
                        </div>

                        {renewalMode === 'cancel' ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Motivo de cancelación</label>
                                    <input value={renewalForm.cancel_reason || ''} onChange={(e) => setRenewalForm({...renewalForm, cancel_reason: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: cliente pausó / cambio de foco / ..." />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</label>
                                    <textarea value={renewalForm.notes || ''} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" rows={3} />
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
                                        <input type="date" value={renewalForm.start_date || ''} onChange={(e) => setRenewalForm({...renewalForm, start_date: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fin</label>
                                        <input type="date" value={renewalForm.end_date || ''} onChange={(e) => setRenewalForm({...renewalForm, end_date: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">UF/mes</label>
                                    <input type="number" step="0.01" min="0" value={renewalForm.uf_mes || ''} onChange={(e) => setRenewalForm({...renewalForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</label>
                                    <textarea value={renewalForm.notes || ''} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" rows={3} />
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end space-x-2">
                            <button onClick={closeRenewal} className="px-4 py-2 rounded-lg border">Cerrar</button>
                            <button onClick={submitRenewal} className={`px-4 py-2 rounded-lg text-white font-medium ${renewalMode === 'cancel' ? 'bg-red-600' : 'color-naranja'}`}>
                                {renewalMode === 'cancel' ? 'Confirmar cancelación' : 'Confirmar renovación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
            {orgDetailOrg && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="skeleton skeleton-card w-64"></div></div>}>
                    <OrgDetail
                        org={orgDetailOrg}
                        keyAccounts={keyAccounts}
                        tickets={tickets}
                        cerrados={cerrados}
                        prospectos={prospectos}
                        ufActual={ufActual}
                        onClose={() => setOrgDetailOrg(null)}
                        onOpenDetail={(type, item) => { setOrgDetailOrg(null); openDetail(type, item as never) }}
                    />
                </Suspense>
            )}
            {selectedEntity && (
                <Suspense fallback={<div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"><div className="skeleton skeleton-card w-64"></div></div>}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <EntityDetail entity={selectedEntity as any} onClose={() => setSelectedEntity(null)} contactos={contactos} notas={notas} user={user} keyAccounts={keyAccounts} ufActual={ufActual} onRefresh={() => { loadNotas(); loadContactos(); loadProspectos(); loadCerrados(); loadTickets(); loadKeyAccounts(); }} />
                </Suspense>
            )}
        </div>
    );
}

export default CRMApp
