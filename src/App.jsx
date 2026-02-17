import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './utils/supabase'
import { showToast, confirmModal } from './utils/toast'
import { formatCLP, formatUF, formatDate, formatDateTime, getNombreMes, formatNumber, formatFileSize } from './utils/formatters'
import { Chart, registerables } from 'chart.js'
import * as XLSX from 'xlsx'

// Components
import Dashboard from './components/Dashboard/Dashboard'
import ContabilidadView from './components/Contabilidad/ContabilidadView'
import LoginModal from './components/Modals/LoginModal'
import KanbanBoard from './components/Pipeline/KanbanBoard'
import ReportesView from './components/Reportes/ReportesView'
import CerradosView from './components/Cerrados/CerradosView'
import TicketsView from './components/Tickets/TicketsView'
import KeyAccountsView from './components/KeyAccounts/KeyAccountsView'
import UniversalModal from './components/Modals/UniversalModal'
import HistoryModal from './components/shared/HistoryModal'
import FilesModal from './components/shared/FilesModal'

Chart.register(...registerables)

// Error logging (sin manipular el DOM de React)
if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
        console.error('[CRM Error]', e?.error || e?.message || e);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('[CRM Unhandled Rejection]', e?.reason || e);
    });
}

async function obtenerUFHoy() {
    try {
        const res = await fetch('https://mindicador.cl/api/uf');
        const data = await res.json();
        if (data?.serie?.[0]?.valor) {
            return Math.round(data.serie[0].valor);
        }
    } catch (e) {
        console.warn('No se pudo obtener UF del día, usando valor por defecto', e);
    }
    return 38000;
}

// Función utilitaria para exportar datos a CSV
function exportToCSV(data, filename = 'export.csv') {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
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
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function CRMApp() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pipeline');
    const [prospectos, setProspectos] = useState([]);
    const [cerrados, setCerrados] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [keyAccounts, setKeyAccounts] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [modalType, setModalType] = useState('prospecto');
    const [editingItem, setEditingItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTipo, setFilterTipo] = useState('todos');
    const [ufActual, setUfActual] = useState(38000); // Valor UF del día
    const [monedaPreferida, setMonedaPreferida] = useState('CLP'); // Toggle global UF/CLP
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        return saved === 'true';
    });
    
    // Aplicar tema al document
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', darkMode);
        localStorage.setItem('darkMode', darkMode);
    }, [darkMode]);
    const [actividadReciente, setActividadReciente] = useState([]);

    // Modal de archivos
    const [filesModalOpen, setFilesModalOpen] = useState(false);
    const [filesEntityType, setFilesEntityType] = useState(null);
    const [filesEntityId, setFilesEntityId] = useState(null);
    const [filesEntityName, setFilesEntityName] = useState('');
    const [filesList, setFilesList] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);

    // Estados de Contabilidad
    const [facturasEmitidas, setFacturasEmitidas] = useState([]);
    const [facturasRecibidas, setFacturasRecibidas] = useState([]);
    const [cajaChica, setCajaChica] = useState([]);
    const [boletasHonorarios, setBoletasHonorarios] = useState([]);
    const [sueldosSocios, setSueldosSocios] = useState([]);
    const [movimientosBancarios, setMovimientosBancarios] = useState([]);
    const [contaTab, setContaTab] = useState('dashboard');
    
    // Alertas de validación de datos
    const [alertasValidacion, setAlertasValidacion] = useState([]); // Sub-tab activa

    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyTitle, setHistoryTitle] = useState('');
    const [historyEntityType, setHistoryEntityType] = useState(null);
    const [historyEntityId, setHistoryEntityId] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);

    // Conversión
    const [convertOpen, setConvertOpen] = useState(false);
    const [convertSource, setConvertSource] = useState({ type: 'prospecto', item: null });
    const [convertTarget, setConvertTarget] = useState('ticket');
    const [convertForm, setConvertForm] = useState({
        ticket: '',
        fecha_inicio: '',
        fecha_entrega: '',
        responsable: '',
        servicio: '',
        uf_mes: '',
        inicio_contrato: '',
        fin_contrato: '',
        notes: ''
    });

    // Renovaciones / cancelación
    const [renewalOpen, setRenewalOpen] = useState(false);
    const [renewalKA, setRenewalKA] = useState(null);
    const [renewalMode, setRenewalMode] = useState('renew'); // 'renew' | 'cancel'
    const [renewalForm, setRenewalForm] = useState({
        start_date: '',
        end_date: '',
        uf_mes: '',
        cancel_reason: '',
        notes: ''
    });
    const [cancelAlsoRegisterLoss, setCancelAlsoRegisterLoss] = useState(true);
    

    useEffect(() => { checkAccess(); }, []);
    useEffect(() => { if (user) loadAllData(); }, [user]);
    useEffect(() => {
        // Cargar UF del día al iniciar
        obtenerUFHoy().then(uf => setUfActual(uf));
    }, []);

    const checkAccess = () => {
        const savedEmail = localStorage.getItem('crm_tho_email');
        if (savedEmail) {
            setUser({ email: savedEmail, name: savedEmail.split('@')[0] });
        }
        setLoading(false);
    };

    const handleLogin = (email) => {
        localStorage.setItem('crm_tho_email', email);
        setUser({ email, name: email.split('@')[0] });
        setShowLoginModal(false);
    };

    const loadAllData = async () => {
        await Promise.all([
            loadProspectos(), 
            loadCerrados(), 
            loadTickets(), 
            loadKeyAccounts(), 
            loadActividad(),
            loadFacturasEmitidas(),
            loadFacturasRecibidas(),
            loadCajaChica(),
            loadBoletasHonorarios(),
            loadSueldosSocios(),
            loadMovimientosBancarios()
        ]);
    };

    const loadActividad = async () => {
        try {
            const { data, error } = await supabase
                .from('crm_events')
                .select('event_type,title,entity_type,entity_id,created_at,created_by_email,payload')
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (error) {
                console.warn('No se pudo cargar actividad:', error);
                setActividadReciente([]);
            } else {
                const procesados = (data || []).map(evento => {
                    const payload = evento.payload || {};
                    const antes = payload.old || {};
                    const despues = payload.new || {};
                    const tipo = evento.entity_type;
                    const org = despues.organizacion || antes.organizacion || '';
                    const ticket = despues.ticket || antes.ticket || '';
                    const servicio = despues.servicio || antes.servicio || '';
                    const nombre = tipo === 'tickets' ? ticket : tipo === 'key_accounts' ? servicio : org;
                    const contextual = org && nombre && nombre !== org ? `${org} · ${nombre}` : (org || nombre || '');

                    let texto = '';
                    let icono = '📌';

                    if (evento.event_type === 'insert') {
                        // Creación
                        if (tipo === 'prospectos') {
                            const valor = despues.valor ? ` por ${despues.valor} UF` : '';
                            texto = `Nuevo prospecto: ${org}${valor}`;
                            icono = '🆕';
                        } else if (tipo === 'tickets') {
                            const valor = despues.valor_monto ? ` · ${despues.valor_monto} ${despues.valor_moneda || 'UF'}` : '';
                            texto = `Nuevo ticket: ${ticket} en ${org}${valor}`;
                            icono = '🎫';
                        } else if (tipo === 'key_accounts') {
                            texto = `Nuevo key account: ${org} · ${servicio} (${despues.uf_mes || 0} UF/mes)`;
                            icono = '⭐';
                        } else if (tipo === 'facturas_emitidas') {
                            texto = `Factura emitida a ${despues.cliente || org}: ${despues.monto_uf || 0} UF`;
                            icono = '📤';
                        } else if (tipo === 'facturas_recibidas') {
                            texto = `Factura recibida de ${despues.proveedor || org}: ${despues.monto_uf || 0} UF`;
                            icono = '📥';
                        } else if (tipo === 'boletas_honorarios') {
                            texto = `Boleta de honorarios: ${despues.prestador || ''} por ${despues.monto_bruto_uf || 0} UF bruto`;
                            icono = '👤';
                        } else if (tipo === 'caja_chica') {
                            texto = `Gasto caja chica: ${despues.descripcion || despues.categoria || 'Sin descripción'}`;
                            icono = '💵';
                        } else {
                            texto = contextual ? `Se creó: ${contextual}` : evento.title || 'Nuevo registro';
                            icono = '🆕';
                        }
                    } else if (evento.event_type === 'update') {
                        // Actualización — narrar el cambio más relevante
                        if (tipo === 'prospectos') {
                            if (antes.estado !== despues.estado) {
                                texto = `${org} avanzó de "${antes.estado}" a "${despues.estado}"`;
                                icono = despues.estado === 'Ganado' ? '🏆' : '📈';
                            } else if (antes.valor !== despues.valor) {
                                texto = `${org}: valor actualizado de ${antes.valor || 0} a ${despues.valor} UF`;
                                icono = '💰';
                            } else if (antes.contacto !== despues.contacto) {
                                texto = `${org}: contacto cambiado a ${despues.contacto}`;
                                icono = '👤';
                            } else {
                                texto = `Se actualizó prospecto: ${org}`;
                                icono = '✏️';
                            }
                        } else if (tipo === 'tickets') {
                            if (antes.fase_actual !== despues.fase_actual) {
                                texto = `${ticket} en ${org}: avanzó de "${antes.fase_actual}" a "${despues.fase_actual}"`;
                                icono = '📈';
                            } else if (antes.porcentaje_avance !== despues.porcentaje_avance) {
                                texto = `${ticket} en ${org}: avance ${antes.porcentaje_avance || 0}% → ${despues.porcentaje_avance}%`;
                                icono = '📊';
                            } else if (antes.ticket !== despues.ticket) {
                                texto = `Ticket renombrado en ${org}: "${antes.ticket}" → "${despues.ticket}"`;
                                icono = '✏️';
                            } else {
                                texto = `Se actualizó ticket: ${ticket} en ${org}`;
                                icono = '✏️';
                            }
                        } else if (tipo === 'key_accounts') {
                            if (antes.renovacion !== despues.renovacion) {
                                texto = `${org} · ${servicio}: renovación marcada como "${despues.renovacion}"`;
                                icono = '🔄';
                            } else if (antes.salud !== despues.salud) {
                                texto = `${org} · ${servicio}: salud cambió de "${antes.salud}" a "${despues.salud}"`;
                                icono = despues.salud === 'Crítico' || despues.salud === 'Riesgo' ? '⚠️' : '💚';
                            } else {
                                texto = `Se actualizó key account: ${org} · ${servicio}`;
                                icono = '✏️';
                            }
                        } else if (tipo === 'facturas_emitidas') {
                            if (antes.estado !== despues.estado) {
                                texto = `Factura a ${despues.cliente || org}: estado cambió a "${despues.estado}"`;
                                icono = despues.estado === 'Pagada' ? '✅' : '📋';
                            } else {
                                texto = `Se actualizó factura a ${despues.cliente || org}`;
                                icono = '✏️';
                            }
                        } else if (tipo === 'facturas_recibidas') {
                            if (antes.estado !== despues.estado) {
                                texto = `Factura de ${despues.proveedor || org}: estado cambió a "${despues.estado}"`;
                                icono = despues.estado === 'Pagada' ? '✅' : '📋';
                            } else {
                                texto = `Se actualizó factura de ${despues.proveedor || org}`;
                                icono = '✏️';
                            }
                        } else {
                            texto = contextual ? `Se actualizó: ${contextual}` : evento.title || 'Registro actualizado';
                            icono = '✏️';
                        }
                    } else if (evento.event_type === 'delete') {
                        texto = contextual ? `Se eliminó: ${contextual}` : evento.title || 'Registro eliminado';
                        icono = '🗑️';
                    } else {
                        texto = evento.title || 'Actividad';
                        icono = '📌';
                    }

                    return { ...evento, titulo_mejorado: texto, icono_mejorado: icono };
                });
                
                setActividadReciente(procesados);
            }
        } catch (e) {
            console.warn('Error cargando actividad:', e);
            setActividadReciente([]);
        }
    };

    const loadProspectos = async () => {
        const { data, error } = await supabase.from('prospectos').select('*').order('created_at', { ascending: false });
        if (error) console.error('Error loading prospectos:', error);
        else {
            // No mostramos prospectos ya convertidos (quedan solo como registro histórico)
            const cleaned = (data || []).filter(p => (p.estado || '').toLowerCase() !== 'convertido');
            setProspectos(cleaned);
        }
    };

    const loadCerrados = async () => {
        const { data, error } = await supabase.from('cerrados').select('*').order('fecha_cierre', { ascending: false });
        if (error) console.error('Error loading cerrados:', error);
        else setCerrados(data || []);
    };

    const loadTickets = async () => {
        const { data, error } = await supabase.from('tickets').select('*').order('fecha_inicio', { ascending: false });
        if (error) console.error('Error loading tickets:', error);
        else {
            // Filtrar solo tickets activos (no cerrados)
            const activos = (data || []).filter(t => (t.status || '').toLowerCase() !== 'cerrado');
            setTickets(activos);
        }
    };

    const loadKeyAccounts = async () => {
        const { data, error } = await supabase.from('key_accounts').select('*').order('created_at', { ascending: false });
        if (error) console.error('Error loading key accounts:', error);
        else {
            // Por defecto ocultamos cuentas cerradas/canceladas
            const cleaned = (data || []).filter(ka => {
                const s = (ka.salud || '').toLowerCase();
                return !['cerrado','cancelado','canceled','cancelled'].includes(s);
            });
            setKeyAccounts(cleaned);
        }
    };

    // ===== CARGA DE CONTABILIDAD =====
    const loadFacturasEmitidas = async () => {
        const { data, error } = await supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false });
        if (error) console.error('Error loading facturas emitidas:', error);
        else {
            setFacturasEmitidas(data || []);
            validarFacturas(data || [], 'emitidas');
        }
    };
    
    // Validar anomalías en facturas
    const validarFacturas = (facturas, tipo) => {
        const alertas = [];
        const tipoLabel = tipo === 'emitidas' ? 'Emitidas' : 'Recibidas';
        
        // Filtrar solo facturas activas (no anuladas)
        const activas = facturas.filter(f => f.estado !== 'Reclamado' && f.estado !== 'Reclamada');
        
        // 1. Detectar saltos de numeración sospechosos (solo en emitidas)
        if (tipo === 'emitidas' && activas.length > 1) {
            const numeros = activas
                .map(f => parseInt(f.numero_factura))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b);
            
            for (let i = 1; i < numeros.length; i++) {
                const salto = numeros[i] - numeros[i-1];
                if (salto > 10) {
                    alertas.push({
                        tipo: 'warning',
                        mensaje: `⚠️ Salto de numeración sospechoso: de factura #${numeros[i-1]} a #${numeros[i]} (salto de ${salto})`
                    });
                }
            }
        }
        
        // 2. Detectar facturas duplicadas (mismo número)
        if (tipo === 'emitidas') {
            const numerosConteo = {};
            activas.forEach(f => {
                const num = f.numero_factura;
                numerosConteo[num] = (numerosConteo[num] || 0) + 1;
            });
            
            Object.entries(numerosConteo).forEach(([num, count]) => {
                if (count > 1) {
                    alertas.push({
                        tipo: 'error',
                        mensaje: `🔴 Factura duplicada: #${num} aparece ${count} veces`
                    });
                }
            });
        }
        
        // 3. Detectar montos anormalmente altos (>1000 UF)
        const montosAltos = activas.filter(f => parseFloat(f.monto_uf) > 1000);
        if (montosAltos.length > 0) {
            montosAltos.forEach(f => {
                alertas.push({
                    tipo: 'info',
                    mensaje: `💰 Monto inusualmente alto: ${tipo === 'emitidas' ? `Factura #${f.numero_factura}` : f.proveedor} - ${Math.round(f.monto_uf)} UF`
                });
            });
        }
        
        // 4. Detectar facturas con fecha futura
        const hoy = new Date();
        const futuras = activas.filter(f => new Date(f.fecha_emision) > hoy);
        if (futuras.length > 0) {
            alertas.push({
                tipo: 'warning',
                mensaje: `📅 ${futuras.length} factura(s) ${tipoLabel.toLowerCase()} con fecha futura`
            });
        }
        
        // Actualizar alertas globales
        setAlertasValidacion(prev => {
            const sinTipo = prev.filter(a => !a.mensaje.includes(tipoLabel));
            return [...sinTipo, ...alertas];
        });
    };

    const loadFacturasRecibidas = async () => {
        const { data, error } = await supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false });
        if (error) console.error('Error loading facturas recibidas:', error);
        else {
            setFacturasRecibidas(data || []);
            validarFacturas(data || [], 'recibidas');
        }
    };

    const loadCajaChica = async () => {
        const { data, error } = await supabase.from('caja_chica').select('*').order('fecha', { ascending: false });
        if (error) console.error('Error loading caja chica:', error);
        else setCajaChica(data || []);
    };

    const loadBoletasHonorarios = async () => {
        const { data, error } = await supabase.from('boletas_honorarios').select('*').order('fecha', { ascending: false });
        if (error) console.error('Error loading boletas honorarios:', error);
        else setBoletasHonorarios(data || []);
    };
    
    const loadSueldosSocios = async () => {
        const { data, error } = await supabase.from('sueldos_socios').select('*').order('fecha', { ascending: false });
        if (error) console.error('Error loading sueldos socios:', error);
        else setSueldosSocios(data || []);
    };
    
    const loadMovimientosBancarios = async () => {
        const { data, error } = await supabase.from('movimientos_bancarios').select('*').order('fecha', { ascending: false });
        if (error) console.error('Error loading movimientos bancarios:', error);
        else setMovimientosBancarios(data || []);
    };
    
    // Sincronizar Boletas de Honorarios desde SimpleAPI
    const sincronizarBoletasSII = async () => {
        const apiKey = prompt('Ingresa tu API Key de SimpleAPI:');
        if (!apiKey) return;
        
        const rutUsuario = prompt('Ingresa tu RUT (con guión, ej: 12345678-9):');
        if (!rutUsuario) return;
        
        const passwordSII = prompt('Ingresa tu contraseña del SII:');
        if (!passwordSII) return;
        
        const año = prompt('¿Qué año deseas sincronizar? (ejemplo: 2025)');
        if (!año) return;
        
        const mes = prompt('¿Qué mes? (1-12, o deja vacío para TODO el año)');
        
        // Validar mes solo si se ingresó
        if (mes && (parseInt(mes) < 1 || parseInt(mes) > 12)) {
            showToast('Mes inválido (debe ser 1-12 o vacío para todo el año)', 'info');
            return;
        }
        
        // Mostrar loading
        const mesTexto = mes ? getNombreMes(parseInt(mes)) : 'TODO';
        const loading = confirm(`Sincronizando boletas de ${mesTexto} ${año}...\n\nPresiona OK para continuar.`);
        if (!loading) return;
        
        try {
            console.log('Intentando sincronizar:', año, mes || 'TODO EL AÑO');
            
            // Si no se especificó mes, sincronizar todos los meses
            const mesesASincronizar = mes ? [parseInt(mes)] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            
            let totalInsertadas = 0;
            let totalDuplicadas = 0;
            let totalErrores = 0;
            
            // Obtener boletas existentes una sola vez para detectar duplicados
            const { data: existentes } = await supabase.from('boletas_honorarios').select('*');
            const existentesMap = new Set(
                (existentes || []).map(b => `${b.prestador}-${b.fecha}-${b.monto_bruto_clp}`)
            );
            
            for (const mesActual of mesesASincronizar) {
                try {
                    console.log(`Sincronizando ${getNombreMes(mesActual)} ${año}...`);
                    
                    // Usar Vercel Serverless Function
                    const payload = {
                        apiKey: apiKey,
                        rutUsuario: rutUsuario,
                        passwordSII: passwordSII,
                        año: año,
                        mes: mesActual
                    };
                    
                    const response = await fetch('/api/sync-boletas', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error(`Error en ${getNombreMes(mesActual)}:`, errorData);
                        totalErrores++;
                        continue; // Continuar con el siguiente mes
                    }
                    
                    const result = await response.json();
                    const boletas = result.boletas || result.data || [];
                    
                    console.log(`${getNombreMes(mesActual)}: ${boletas.length} boletas encontradas`);
                    
                    for (const boleta of boletas) {
                        try {
                            // Extraer campos de la estructura anidada de SimpleAPI
                            const fecha = boleta.encabezado?.fechaBoleta?.split('T')[0] || null;
                            const prestador = boleta.emisor?.razonSocial?.trim() || 'Sin nombre';
                            const rut = boleta.emisor?.rut || '';
                            const montoBruto = parseFloat(boleta.honorarios?.brutos) || 0;
                            const retenido = parseFloat(boleta.honorarios?.retenido) || 0;
                            const liquido = parseFloat(boleta.honorarios?.pagado) || 0;
                            const ufDia = ufActual;
                            
                            // Detectar duplicados
                            const key = `${prestador}-${fecha}-${montoBruto}`;
                            if (existentesMap.has(key)) {
                                totalDuplicadas++;
                                continue;
                            }
                            
                            const nuevaBoleta = {
                                fecha: fecha,
                                prestador: prestador,
                                rut: rut,
                                monto_bruto_clp: montoBruto,
                                monto_bruto_uf: (montoBruto / ufDia).toFixed(2),
                                monto_retencion_clp: retenido,
                                monto_retencion_uf: (retenido / ufDia).toFixed(2),
                                monto_liquido_clp: liquido,
                                monto_liquido_uf: (liquido / ufDia).toFixed(2),
                                porcentaje_retencion: retenido > 0 ? ((retenido / montoBruto) * 100).toFixed(2) : 0,
                                uf_dia: ufDia,
                                descripcion: '',
                                mes_servicio: `${getNombreMes(mesActual)} ${año}`,
                                proyecto: '',
                                moneda_principal: 'CLP'
                            };
                            
                            const { error: insertError } = await supabase
                                .from('boletas_honorarios')
                                .insert([nuevaBoleta]);
                            
                            if (insertError) {
                                console.error('Error insertando boleta:', insertError);
                                totalErrores++;
                            } else {
                                totalInsertadas++;
                                existentesMap.add(key); // Agregar al set para evitar duplicados en la misma sincronización
                            }
                        } catch (boletaError) {
                            console.error('Error procesando boleta individual:', boletaError);
                            totalErrores++;
                        }
                    }
                } catch (mesError) {
                    console.error(`Error sincronizando ${getNombreMes(mesActual)}:`, mesError);
                    totalErrores++;
                }
            }
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} boletas nuevas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "info");
            loadBoletasHonorarios();
            
        } catch (error) {
            console.error('Error sincronizando:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}\n\nRevisa la consola del navegador para más detalles (F12).`, "info");
        }
    };
    
    // Sincronizar Facturas Emitidas desde SII
    const sincronizarFacturasEmitidas = async () => {
        const apiKey = prompt('Ingresa tu API Key de SimpleAPI:');
        if (!apiKey) return;
        
        const rutUsuario = prompt('Ingresa tu RUT (con guión, ej: 12345678-9):');
        if (!rutUsuario) return;
        
        const passwordSII = prompt('Ingresa tu contraseña del SII:');
        if (!passwordSII) return;
        
        const año = prompt('¿Qué año deseas sincronizar? (ejemplo: 2025)');
        if (!año) return;
        
        const mes = prompt('¿Qué mes? (1-12, o deja vacío para TODO el año)');
        
        if (mes && (parseInt(mes) < 1 || parseInt(mes) > 12)) {
            showToast('Mes inválido (debe ser 1-12 o vacío para todo el año)', 'info');
            return;
        }
        
        const mesTexto = mes ? getNombreMes(parseInt(mes)) : 'TODO';
        const loading = confirm(`Sincronizando facturas emitidas de ${mesTexto} ${año}...\n\nPresiona OK para continuar.`);
        if (!loading) return;
        
        try {
            const mesesASincronizar = mes ? [parseInt(mes)] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            
            let totalInsertadas = 0;
            let totalDuplicadas = 0;
            let totalErrores = 0;
            
            const { data: existentes } = await supabase.from('facturas_emitidas').select('*');
            const existentesMap = new Set(
                (existentes || []).map(f => `${f.numero_factura}-${f.fecha_emision}`)
            );
            
            for (const mesActual of mesesASincronizar) {
                try {
                    console.log(`Sincronizando facturas emitidas ${getNombreMes(mesActual)} ${año}...`);
                    
                    const payload = {
                        apiKey: apiKey,
                        rutUsuario: rutUsuario,
                        passwordSII: passwordSII,
                        año: año,
                        mes: mesActual
                    };
                    
                    const response = await fetch('/api/sync-facturas-emitidas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error(`Error en ${getNombreMes(mesActual)}:`, errorData);
                        totalErrores++;
                        continue;
                    }
                    
                    const result = await response.json();
                    const documentos = result.documentos || [];
                    
                    console.log(`${getNombreMes(mesActual)}: ${documentos.length} documentos encontrados`);
                    
                    for (const doc of documentos) {
                        try {
                            // Filtrar solo facturas (33 y 34), excluir notas de crédito/débito
                            if (![33, 34].includes(doc.tipo)) {
                                console.log(`Documento tipo ${doc.tipo} omitido (no es factura)`);
                                continue;
                            }
                            
                            // Verificar estado - solo vigentes
                            if (doc.estado && doc.estado !== 'VIGENTE') {
                                console.log(`Factura ${doc.folio} omitida (estado: ${doc.estado})`);
                                continue;
                            }
                            
                            const fecha = doc.fecha || doc.fechaEmision || null;
                            const cliente = doc.receptor?.razonSocial || 'Sin nombre';
                            const rutCliente = doc.receptor?.rut || '';
                            const total = parseFloat(doc.totales?.total || doc.total || 0);
                            const neto = parseFloat(doc.totales?.neto || doc.neto || 0);
                            
                            // Detectar duplicados
                            const key = `${doc.folio}-${fecha}`;
                            if (existentesMap.has(key)) {
                                totalDuplicadas++;
                                continue;
                            }
                            
                            const nuevaFactura = {
                                fecha_emision: fecha,
                                numero_factura: doc.folio,
                                cliente: cliente,
                                rut_cliente: rutCliente,
                                monto_neto_clp: neto,
                                monto_clp: total,
                                monto_uf: (total / ufActual).toFixed(2),
                                descripcion: doc.descripcion || `Factura tipo ${doc.tipo}`,
                                estado: 'Pendiente',
                                moneda_principal: 'CLP',
                                uf_dia: ufActual
                            };
                            
                            const { error: insertError } = await supabase
                                .from('facturas_emitidas')
                                .insert([nuevaFactura]);
                            
                            if (insertError) {
                                console.error('Error insertando factura:', insertError);
                                totalErrores++;
                            } else {
                                totalInsertadas++;
                                existentesMap.add(key);
                            }
                        } catch (docError) {
                            console.error('Error procesando documento:', docError);
                            totalErrores++;
                        }
                    }
                } catch (mesError) {
                    console.error(`Error sincronizando ${getNombreMes(mesActual)}:`, mesError);
                    totalErrores++;
                }
            }
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} facturas emitidas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "info");
            loadFacturasEmitidas();
            
        } catch (error) {
            console.error('Error sincronizando facturas emitidas:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}`, "info");
        }
    };
    
    // Sincronizar Facturas Recibidas desde SII
    const sincronizarFacturasRecibidas = async () => {
        const apiKey = prompt('Ingresa tu API Key de SimpleAPI:');
        if (!apiKey) return;
        
        const rutUsuario = prompt('Ingresa tu RUT (con guión, ej: 12345678-9):');
        if (!rutUsuario) return;
        
        const passwordSII = prompt('Ingresa tu contraseña del SII:');
        if (!passwordSII) return;
        
        const año = prompt('¿Qué año deseas sincronizar? (ejemplo: 2025)');
        if (!año) return;
        
        const mes = prompt('¿Qué mes? (1-12, o deja vacío para TODO el año)');
        
        if (mes && (parseInt(mes) < 1 || parseInt(mes) > 12)) {
            showToast('Mes inválido (debe ser 1-12 o vacío para todo el año)', 'info');
            return;
        }
        
        const mesTexto = mes ? getNombreMes(parseInt(mes)) : 'TODO';
        const loading = confirm(`Sincronizando facturas recibidas de ${mesTexto} ${año}...\n\nPresiona OK para continuar.`);
        if (!loading) return;
        
        try {
            const mesesASincronizar = mes ? [parseInt(mes)] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            
            let totalInsertadas = 0;
            let totalDuplicadas = 0;
            let totalErrores = 0;
            
            const { data: existentes } = await supabase.from('facturas_recibidas').select('*');
            const existentesMap = new Set(
                (existentes || []).map(f => `${f.numero_factura}-${f.fecha_emision}`)
            );
            
            for (const mesActual of mesesASincronizar) {
                try {
                    console.log(`Sincronizando facturas recibidas ${getNombreMes(mesActual)} ${año}...`);
                    
                    const payload = {
                        apiKey: apiKey,
                        rutUsuario: rutUsuario,
                        passwordSII: passwordSII,
                        año: año,
                        mes: mesActual
                    };
                    
                    const response = await fetch('/api/sync-facturas-recibidas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        console.error(`Error en ${getNombreMes(mesActual)}:`, errorData);
                        totalErrores++;
                        continue;
                    }
                    
                    const result = await response.json();
                    const documentos = result.documentos || [];
                    
                    console.log(`${getNombreMes(mesActual)}: ${documentos.length} documentos encontrados`);
                    
                    for (const doc of documentos) {
                        try {
                            // Filtrar solo facturas (33 y 34), excluir notas de crédito/débito
                            if (![33, 34].includes(doc.tipo)) {
                                console.log(`Documento tipo ${doc.tipo} omitido (no es factura)`);
                                continue;
                            }
                            
                            // Verificar estado - solo vigentes
                            if (doc.estado && doc.estado !== 'VIGENTE') {
                                console.log(`Factura ${doc.folio} omitida (estado: ${doc.estado})`);
                                continue;
                            }
                            
                            const fecha = doc.fecha || doc.fechaEmision || null;
                            const proveedor = doc.emisor?.razonSocial || 'Sin nombre';
                            const rutProveedor = doc.emisor?.rut || '';
                            const total = parseFloat(doc.totales?.total || doc.total || 0);
                            const neto = parseFloat(doc.totales?.neto || doc.neto || 0);
                            
                            // Detectar duplicados
                            const key = `${doc.folio}-${fecha}`;
                            if (existentesMap.has(key)) {
                                totalDuplicadas++;
                                continue;
                            }
                            
                            const nuevaFactura = {
                                fecha_emision: fecha,
                                numero_factura: doc.folio,
                                proveedor: proveedor,
                                rut_proveedor: rutProveedor,
                                monto_neto_clp: neto,
                                monto_clp: total,
                                monto_uf: (total / ufActual).toFixed(2),
                                descripcion: doc.descripcion || `Factura tipo ${doc.tipo}`,
                                estado: 'Pendiente',
                                moneda_principal: 'CLP',
                                uf_dia: ufActual
                            };
                            
                            const { error: insertError } = await supabase
                                .from('facturas_recibidas')
                                .insert([nuevaFactura]);
                            
                            if (insertError) {
                                console.error('Error insertando factura:', insertError);
                                totalErrores++;
                            } else {
                                totalInsertadas++;
                                existentesMap.add(key);
                            }
                        } catch (docError) {
                            console.error('Error procesando documento:', docError);
                            totalErrores++;
                        }
                    }
                } catch (mesError) {
                    console.error(`Error sincronizando ${getNombreMes(mesActual)}:`, mesError);
                    totalErrores++;
                }
            }
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} facturas recibidas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "info");
            loadFacturasRecibidas();
            
        } catch (error) {
            console.error('Error sincronizando facturas recibidas:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}`, "info");
        }
    };
    
    const getNombreMes = (num) => {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return meses[num - 1] || '';
    };

    // ===== MÉTRICAS AVANZADAS =====
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const añoActual = hoy.getFullYear();
    const mesAnterior = mesActual === 0 ? 11 : mesActual - 1;
    const añoMesAnterior = mesActual === 0 ? añoActual - 1 : añoActual;

    // Cerrados este mes
    const cerradosEsteMes = cerrados.filter(c => {
        const f = new Date(c.fecha_cierre);
        return f.getMonth() === mesActual && f.getFullYear() === añoActual;
    });
    
    // Cerrados mes anterior
    const cerradosMesAnterior = cerrados.filter(c => {
        const f = new Date(c.fecha_cierre);
        return f.getMonth() === mesAnterior && f.getFullYear() === añoMesAnterior;
    });

    // MRR (Monthly Recurring Revenue)
    const mrrActual = keyAccounts
        .filter(ka => (ka.salud || '').toLowerCase() !== 'cerrado')
        .reduce((sum, ka) => sum + (parseFloat(ka.uf_mes) || 0), 0);

    // Valor de tickets activos (convertir CLP a UF si es necesario)
    const valorTickets = tickets.reduce((sum, t) => {
        const monto = parseFloat(t.valor_monto) || 0;
        if (t.valor_moneda === 'CLP') {
            // Convertir CLP a UF usando el valor actual
            return sum + (monto / (ufActual || 38000));
        }
        return sum + monto; // Ya está en UF
    }, 0);

    // Ingresos REALES = Solo trabajo activo (MRR + Tickets)
    // El historial es pasado, no cuenta para ingresos actuales
    const ingresosEsteMes = mrrActual + valorTickets;
    
    // Para comparación mes anterior, asumimos mismo nivel
    const ingresosMesAnterior = mrrActual + valorTickets; // Podríamos mejorarlo después

    const variacionIngresos = ingresosMesAnterior > 0 
        ? Math.round(((ingresosEsteMes - ingresosMesAnterior) / ingresosMesAnterior) * 100)
        : ingresosEsteMes > 0 ? 100 : 0;

    // Alertas
    const prospectosVencidos = prospectos.filter(p => {
        const limite = new Date(p.fecha_limite);
        return limite < hoy && p.estado !== 'Convertido';
    });

    const prospectosSinActividad = prospectos.filter(p => {
        if (!p.updated_at) return false;
        const ultimaActividad = new Date(p.updated_at);
        const diasSinActividad = Math.floor((hoy - ultimaActividad) / (1000 * 60 * 60 * 24));
        return diasSinActividad > 14;
    });

    const keyAccountsPorRenovar = keyAccounts.filter(ka => {
        if (!ka.fin_contrato || (ka.salud || '').toLowerCase() === 'cerrado') return false;
        const fin = new Date(ka.fin_contrato);
        const diasHastaFin = Math.floor((fin - hoy) / (1000 * 60 * 60 * 24));
        return diasHastaFin > 0 && diasHastaFin <= 30;
    });

    // Conversión
    const tasaConversion = cerrados.length > 0 
        ? Math.round((cerrados.filter(c => c.estado_final === 'Ganado').length / cerrados.length) * 100) 
        : 0;

    const tasaConversionMesAnterior = cerradosMesAnterior.length > 0
        ? Math.round((cerradosMesAnterior.filter(c => c.estado_final === 'Ganado').length / cerradosMesAnterior.length) * 100)
        : 0;

    // Salud del negocio con explicación detallada
    let saludNegocio = 'Saludable';
    let saludColor = 'verde';
    let saludMensaje = '';
    let saludDetalles = [];
    
    // Criterios de salud
    const criterios = {
        prospectosVencidos: prospectosVencidos.length,
        prospectosSinActividad: prospectosSinActividad.length,
        tasaConversion: tasaConversion,
        mrrActual: mrrActual,
        pipelineTotal: prospectos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0)
    };
    
    // Evaluar salud
    let puntosRiesgo = 0;
    
    // Criterio 1: Prospectos vencidos
    if (criterios.prospectosVencidos === 0) {
        saludDetalles.push('✅ Sin prospectos vencidos');
    } else if (criterios.prospectosVencidos <= 3) {
        saludDetalles.push(`⚠️ ${criterios.prospectosVencidos} prospecto${criterios.prospectosVencidos > 1 ? 's' : ''} vencido${criterios.prospectosVencidos > 1 ? 's' : ''} (normal)`);
        puntosRiesgo += 1;
    } else if (criterios.prospectosVencidos <= 7) {
        saludDetalles.push(`🟡 ${criterios.prospectosVencidos} prospectos vencidos (requiere atención)`);
        puntosRiesgo += 2;
    } else {
        saludDetalles.push(`🔴 ${criterios.prospectosVencidos} prospectos vencidos (crítico)`);
        puntosRiesgo += 3;
    }
    
    // Criterio 2: Conversión
    if (criterios.tasaConversion >= 60) {
        saludDetalles.push(`✅ Conversión excelente (${criterios.tasaConversion}%)`);
    } else if (criterios.tasaConversion >= 40) {
        saludDetalles.push(`⚠️ Conversión aceptable (${criterios.tasaConversion}%)`);
        puntosRiesgo += 1;
    } else if (criterios.tasaConversion >= 25) {
        saludDetalles.push(`🟡 Conversión baja (${criterios.tasaConversion}%) - objetivo: >40%`);
        puntosRiesgo += 2;
    } else {
        saludDetalles.push(`🔴 Conversión crítica (${criterios.tasaConversion}%) - objetivo: >40%`);
        puntosRiesgo += 3;
    }
    
    // Criterio 3: Pipeline
    if (criterios.pipelineTotal >= 200) {
        saludDetalles.push(`✅ Pipeline saludable (${Math.round(criterios.pipelineTotal)} UF)`);
    } else if (criterios.pipelineTotal >= 100) {
        saludDetalles.push(`⚠️ Pipeline moderado (${Math.round(criterios.pipelineTotal)} UF)`);
        puntosRiesgo += 1;
    } else {
        saludDetalles.push(`🟡 Pipeline bajo (${Math.round(criterios.pipelineTotal)} UF) - objetivo: >100 UF`);
        puntosRiesgo += 2;
    }
    
    // Criterio 4: MRR
    if (criterios.mrrActual >= 100) {
        saludDetalles.push(`✅ MRR sólido (${Math.round(criterios.mrrActual)} UF/mes)`);
    } else if (criterios.mrrActual >= 50) {
        saludDetalles.push(`⚠️ MRR moderado (${Math.round(criterios.mrrActual)} UF/mes)`);
    } else if (criterios.mrrActual > 0) {
        saludDetalles.push(`🟡 MRR bajo (${Math.round(criterios.mrrActual)} UF/mes) - objetivo: >50 UF`);
        puntosRiesgo += 1;
    } else {
        saludDetalles.push(`🔴 Sin MRR - establecer Key Accounts recurrentes`);
        puntosRiesgo += 2;
    }
    
    // Determinar salud final
    if (puntosRiesgo === 0) {
        saludNegocio = 'Excelente';
        saludColor = 'verde';
        saludMensaje = 'Todos los indicadores en verde';
    } else if (puntosRiesgo <= 2) {
        saludNegocio = 'Saludable';
        saludColor = 'verde';
        saludMensaje = 'Negocio estable con áreas de mejora menores';
    } else if (puntosRiesgo <= 5) {
        saludNegocio = 'Requiere atención';
        saludColor = 'naranja';
        saludMensaje = 'Algunos indicadores necesitan mejora';
    } else {
        saludNegocio = 'Crítico';
        saludColor = 'red';
        saludMensaje = 'Múltiples indicadores en riesgo - acción inmediata requerida';
    }

    const metrics = {
        // Básicas
        totalProspectos: prospectos.length,
        reunionesAgendadas: prospectos.filter(p => p.estado === 'Reunión agendada').length,
        propuestasEnviadas: prospectos.filter(p => p.estado === 'Propuesta enviada').length,
        pipelineTotal: prospectos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0),
        proximosCierres: prospectos.filter(p => p.probabilidad > 60).length,
        
        // Avanzadas
        ingresosEsteMes,
        valorTickets,
        ingresosMesAnterior,
        variacionIngresos,
        mrrActual,
        tasaConversion,
        tasaConversionMesAnterior,
        cerradosEsteMes: cerradosEsteMes.length,
        
        // Alertas
        prospectosVencidos: prospectosVencidos.length,
        prospectosSinActividad: prospectosSinActividad.length,
        keyAccountsPorRenovar: keyAccountsPorRenovar.length,
        
        // Salud
        saludNegocio,
        saludColor,
        saludMensaje,
        saludDetalles,
        
        // Listas detalladas
        prospectosVencidosDetalle: prospectosVencidos,
        prospectosSinActividadDetalle: prospectosSinActividad,
        keyAccountsPorRenovarDetalle: keyAccountsPorRenovar
    };

    const estadosKanban = [
        { id: 'contactado', nombre: 'Contactado', emoji: '🔵' },
        { id: 'reunion', nombre: 'Reunión agendada', emoji: '🟡' },
        { id: 'propuesta', nombre: 'Propuesta enviada', emoji: '🟠' },
        { id: 'negociacion', nombre: 'Negociación', emoji: '🟢' }
    ];

    const getEstadoKey = (estado) => {
        if (estado === 'Contactado') return 'contactado';
        if (estado === 'Reunión agendada') return 'reunion';
        if (estado === 'Propuesta enviada') return 'propuesta';
        if (estado === 'Negociación') return 'negociacion';
        return 'contactado';
    };

    const getEstadoFromKey = (key) => {
        if (key === 'contactado') return 'Contactado';
        if (key === 'reunion') return 'Reunión agendada';
        if (key === 'propuesta') return 'Propuesta enviada';
        if (key === 'negociacion') return 'Negociación';
        return 'Contactado';
    };

    const prospectosFiltrados = prospectos.filter(p => {
        const matchSearch = !searchTerm || p.organizacion.toLowerCase().includes(searchTerm.toLowerCase()) || p.contacto.toLowerCase().includes(searchTerm.toLowerCase());
        const matchTipo = filterTipo === 'todos' || p.tipo.includes(filterTipo);
        return matchSearch && matchTipo;
    });

    const prospectosPorEstado = (estadoKey) => prospectosFiltrados.filter(p => getEstadoKey(p.estado) === estadoKey);

    const requireAuth = (callback) => {
        if (!user) {
            setShowLoginModal(true);
            return false;
        }
        return true;
    };


    
    const logEvent = async (entityType, entityId, eventType, title, payload = {}) => {
        try {
            // No bloqueamos UX por logging
            if (!user) return;
            await supabase.from('crm_events').insert([{
                entity_type: entityType,
                entity_id: entityId,
                event_type: eventType,
                title: title,
                payload: payload,
                created_by: user?.id || null,
                created_by_email: user?.email || null
            }]);
        } catch (e) {
            // Silencioso: si falla RLS o tabla, no rompe el flujo
            console.warn('logEvent failed', e?.message || e);
        }
    };

    // -------------------------
    // Conversión (Prospectos y Cerrados)
    // -------------------------
    const openConvert = (prospecto, targetType = 'ticket') => {
        setConvertSource({ type: 'prospecto', item: prospecto });
        const today = new Date().toISOString().split('T')[0];
        const defaultEntrega = prospecto?.fecha_limite || today;
        setConvertTarget(targetType === 'keyaccount' ? 'keyaccount' : 'ticket');
        setConvertForm({
            ticket: `Ejecución - ${prospecto?.organizacion || ''}`.trim(),
            fecha_inicio: today,
            fecha_entrega: defaultEntrega,
            responsable: '',
            servicio: prospecto?.tipo || 'Servicio',
            uf_mes: String(prospecto?.valor ?? ''),
            inicio_contrato: today,
            fin_contrato: defaultEntrega,
            notes: ''
        });
        setConvertOpen(true);
    };

    const openConvertFromCerrado = (cerrado) => {
        setConvertSource({ type: 'cerrado', item: cerrado });
        const today = new Date().toISOString().split('T')[0];
        // En cerrados no hay fecha_limite: proponemos hoy como punto de partida
        setConvertTarget('ticket');
        setConvertForm({
            ticket: `Ejecución - ${cerrado?.organizacion || ''}`.trim(),
            fecha_inicio: today,
            fecha_entrega: today,
            responsable: '',
            servicio: cerrado?.tipo || 'Servicio',
            uf_mes: String(cerrado?.valor ?? ''),
            inicio_contrato: today,
            fin_contrato: today,
            notes: ''
        });
        setConvertOpen(true);
    };

    const closeConvert = () => {
        setConvertOpen(false);
        setConvertSource({ type: 'prospecto', item: null });
    };

    const submitConvert = async () => {
    if (!requireAuth()) return;
    const sourceType = convertSource?.type;
    const source = convertSource?.item;
    if (!sourceType || !source) return;

    try {
        const fromId = source.id;
        const fromEntityType = (sourceType === 'prospecto') ? 'prospectos' : 'cerrados';
        const transitionFrom = (sourceType === 'prospecto') ? 'prospecto' : 'cerrado';

        // 1) Crear entidad destino
        let toType = null;   // 'ticket' | 'key_account'
        let toId = null;

        if (convertTarget === 'ticket') {
            const ticketRow = {
    organizacion: source.organizacion,
    ticket: convertForm.ticket || `Ejecución - ${source.organizacion}`,
    fecha_inicio: convertForm.fecha_inicio,
    fecha_entrega: convertForm.fecha_entrega,
    fase_actual: 'Inicio',
    porcentaje_avance: 0,
    responsable: convertForm.responsable || '',
    satisfaccion: null,
    escalo: false,
    proxima_accion: (sourceType === 'prospecto' ? (source.proximo_paso || '') : ''),
    status: 'Activo'
            };
            const { data, error } = await supabase.from('tickets').insert([ticketRow]).select('id').single();
            if (error) throw error;
            toType = 'ticket';
            toId = data.id;

            await logEvent('tickets', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId });
        } else {
            const kaRow = {
    organizacion: source.organizacion,
    servicio: convertForm.servicio || source.tipo || 'Servicio',
    uf_mes: Number(convertForm.uf_mes || source.valor || 0),
    inicio_contrato: convertForm.inicio_contrato,
    fin_contrato: convertForm.fin_contrato,
    renovacion: 'Mensual',
    salud: 'OK',
    ultima_reunion: null,
    proxima_reunion: null,
    valor_uf_cierre: null,
    fecha_cierre_uf: null
            };
            const { data, error } = await supabase.from('key_accounts').insert([kaRow]).select('id').single();
            if (error) throw error;
            toType = 'key_account';
            toId = data.id;

            // Seed de renovación activa (si existe tabla)
            try {
    await supabase.from('crm_renewals').insert([{
        key_account_id: toId,
        start_date: kaRow.inicio_contrato,
        end_date: kaRow.fin_contrato,
        uf_mes: kaRow.uf_mes,
        status: 'active',
        notes: `Seed desde conversión (${transitionFrom})`
    }]);
            } catch (e) { /* no-op */ }

            await logEvent('key_accounts', toId, 'created_from_' + transitionFrom, `Creado desde ${transitionFrom}`, { from_type: transitionFrom, from_id: fromId });
        }

        // 2) Guardar link (origen -> destino)
        try {
            await supabase.from('crm_entity_links').insert([{
    from_type: transitionFrom,
    from_id: fromId,
    to_type: toType,
    to_id: toId,
    link_type: 'transition'
            }]);
        } catch (e) { /* no-op */ }

        // 2.1) Guardar transición (si existe la tabla crm_transitions)
        try {
            await supabase.from('crm_transitions').insert([{
    entity_from: transitionFrom,
    entity_from_id: fromId,
    entity_to: toType,
    entity_to_id: toId,
    reason: 'Conversión',
    notes: convertForm.notes || null,
    created_by_email: user?.email || null
            }]);
        } catch (e) { /* no-op */ }

        // 3) Si venimos desde prospecto: registrar como GANADO en Historial + marcar como convertido
        if (sourceType === 'prospecto') {
            // 3.1) Guardar en Historial como Ganado
            const cerradoGanado = {
    organizacion: source.organizacion,
    tipo: source.tipo,
    estado_final: 'Ganado',
    fecha_cierre: new Date().toISOString().split('T')[0],
    valor: source.valor,
    razon_perdida: '',
    escalo: false,
    valor_total_final: source.valor,
    fecha_contacto: source.created_at
            };

            try {
    await supabase.from('cerrados').insert([cerradoGanado]);
            } catch (e) {
    console.warn('No se pudo guardar en Historial:', e);
            }

            // 3.2) Marcar prospecto como convertido (no lo borramos)
            const { error: updErr } = await supabase.from('prospectos')
    .update({ estado: 'Convertido', proximo_paso: `Convertido a ${toType === 'ticket' ? 'Ticket' : 'Key Account'}` })
    .eq('id', fromId);
            if (updErr) throw updErr;
        }

        await logEvent(fromEntityType, fromId, 'converted', `${transitionFrom} convertido`, { to_type: toType, to_id: toId });

        // 4) Refresh
        await loadProspectos();
        await loadCerrados();
        await loadTickets();
        await loadKeyAccounts();

        closeConvert();
    } catch (error) {
        alert('Error al convertir: ' + error.message);
    }

    };

    // -------------------------
    // Renovaciones (Key Accounts)
    // -------------------------
    const openRenewal = (ka) => {
        const today = new Date().toISOString().split('T')[0];
        const end = ka?.fin_contrato || today;
        setRenewalKA(ka);
        setRenewalMode('renew');
        setRenewalForm({
            start_date: today,
            end_date: end,
            uf_mes: String(ka?.uf_mes ?? ''),
            cancel_reason: '',
            notes: ''
        });
        setRenewalOpen(true);
    };

    const openCancelKA = (ka) => {
        const today = new Date().toISOString().split('T')[0];
        setRenewalKA(ka);
        setRenewalMode('cancel');
        setCancelAlsoRegisterLoss(true);
        setRenewalForm({
            start_date: today,
            end_date: ka?.fin_contrato || today,
            uf_mes: String(ka?.uf_mes ?? ''),
            cancel_reason: '',
            notes: ''
        });
        setRenewalOpen(true);
    };

    const closeRenewal = () => {
        setRenewalOpen(false);
        setRenewalKA(null);
    };

    const submitRenewal = async () => {
        if (!requireAuth()) return;
        if (!renewalKA) return;

        try {
            const kaId = renewalKA.id;

            if (renewalMode === 'cancel') {
                // intenta RPC
                try {
                    const { error } = await supabase.rpc('crm_cancel_key_account', {
                        p_key_account_id: kaId,
                        p_cancel_reason: renewalForm.cancel_reason || null,
                        p_notes: renewalForm.notes || null
                    });
                    if (error) throw error;
                } catch (e) {
                    // fallback: marcar renewal activa como cancelada
                    await supabase.from('crm_renewals')
                        .update({ status: 'cancelled', cancel_reason: renewalForm.cancel_reason || null, notes: renewalForm.notes || null })
                        .eq('key_account_id', kaId)
                        .eq('status', 'active');
                }

                await logEvent('key_accounts', kaId, 'renewal_cancelled', 'Contrato cancelado', { cancel_reason: renewalForm.cancel_reason || null });

                // Marcamos el Key Account como cerrado para que salga del listado activo
                await supabase.from('key_accounts')
                    .update({ salud: 'Cerrado', updated_at: new Date().toISOString() })
                    .eq('id', kaId);

                // opcional: registrar pérdida en Cerrados (para visibilidad directiva)
                if (cancelAlsoRegisterLoss) {
                    const today = new Date().toISOString().split('T')[0];
                    const closedRow = {
                        organizacion: renewalKA.organizacion,
                        tipo: renewalKA.servicio,
                        estado_final: 'Perdido',
                        fecha_cierre: today,
                        valor: renewalKA.uf_mes,
                        razon_perdida: renewalForm.cancel_reason || '',
                        escalo: false,
                        valor_total_final: renewalKA.uf_mes,
                        fecha_contacto: today
                    };
                    const { error: cerrErr } = await supabase.from('cerrados').insert([closedRow]);
                    if (!cerrErr) {
                        // evento espejo para el cerrado creado (si podemos recuperar id, ideal; aquí dejamos evento solo en KA)
                        await loadCerrados();
                    } else {
                        console.warn('No se pudo registrar en cerrados:', cerrErr.message);
                    }
                }

            } else {
                const start = renewalForm.start_date;
                const end = renewalForm.end_date;
                const uf = Number(renewalForm.uf_mes || renewalKA.uf_mes || 0);

                // intenta RPC
                try {
                    const { error } = await supabase.rpc('crm_create_renewal', {
                        p_key_account_id: kaId,
                        p_start_date: start,
                        p_end_date: end,
                        p_uf_mes: uf,
                        p_notes: renewalForm.notes || null
                    });
                    if (error) throw error;
                } catch (e) {
                    // fallback: cierre renewal activa + insert nueva + update key_accounts
                    await supabase.from('crm_renewals')
                        .update({ status: 'renewed' })
                        .eq('key_account_id', kaId)
                        .eq('status', 'active');

                    await supabase.from('crm_renewals').insert([{
                        key_account_id: kaId,
                        start_date: start,
                        end_date: end,
                        uf_mes: uf,
                        status: 'active',
                        notes: renewalForm.notes || null
                    }]);

                    await supabase.from('key_accounts')
                        .update({ inicio_contrato: start, fin_contrato: end, uf_mes: uf })
                        .eq('id', kaId);
                }

                await logEvent('key_accounts', kaId, 'renewal_created', 'Renovación registrada', { start_date: start, end_date: end, uf_mes: uf });

                await loadKeyAccounts();
            }

            closeRenewal();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const transitionEntityMap = {
        'prospectos': 'prospecto',
        'tickets': 'ticket',
        'key_accounts': 'key_account',
        'cerrados': 'cerrado'
    };

    const openHistory = async (entityType, entityId, title = '') => {
        if (!requireAuth()) return;
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryTitle(title || `${entityType} ${entityId}`);
        setHistoryEntityType(entityType);
        setHistoryEntityId(entityId);
        try {
            const { data: events, error: evErr } = await supabase
                .from('crm_events')
                .select('event_type,title,payload,created_at,created_by_email')
                .eq('entity_type', entityType)
                .eq('entity_id', entityId)
                .order('created_at', { ascending: false })
                .limit(200);

            if (evErr) throw evErr;

            const transitionType = transitionEntityMap[entityType] || entityType;
            const { data: transitions, error: trErr } = await supabase
                .from('crm_transitions')
                .select('created_at,entity_from,entity_from_id,entity_to,entity_to_id,reason,notes')
                .or(`and(entity_from.eq.${transitionType},entity_from_id.eq.${entityId}),and(entity_to.eq.${transitionType},entity_to_id.eq.${entityId})`)
                .order('created_at', { ascending: false })
                .limit(200);

            if (trErr) {
                // Si no existe la tabla o hay RLS, no bloqueamos el historial de eventos
                console.warn('No se pudieron cargar transiciones:', trErr.message);
            }

            
            // También intentamos cargar vínculos/transiciones desde crm_entity_links (si existe)
            let links = [];
            try {
                const et = transitionType;
                const { data: lnk, error: lnkErr } = await supabase
                    .from('crm_entity_links')
                    .select('created_at,from_type,from_id,to_type,to_id,reason,notes')
                    .or(`and(from_type.eq.${et},from_id.eq.${entityId}),and(to_type.eq.${et},to_id.eq.${entityId})`)
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (lnkErr) throw lnkErr;
                links = lnk || [];
            } catch (e) {
                console.warn('No se pudieron cargar crm_entity_links:', e?.message || e);
            }
            const items = [
                ...(events || []).map(e => ({
                    kind: 'event',
                    created_at: e.created_at,
                    label: (e.event_type || 'event').toUpperCase(),
                    title: e.title || '',
                    email: e.created_by_email || '',
                    payload: e.payload
                })),
                ...((transitions || []) || []).map(t => ({
                    kind: 'transition',
                    created_at: t.created_at,
                    label: 'TRANSICIÓN',
                    title: t.reason || '',
                    email: '',
                    payload: { from: t.entity_from, to: t.entity_to, notes: t.notes }
                })),
                ...(links || []).map(l => ({
                    kind: 'link',
                    created_at: l.created_at,
                    label: 'TRANSICIÓN',
                    title: l.reason || '',
                    email: '',
                    payload: { from: l.from_type, to: l.to_type, notes: l.notes, from_id: l.from_id, to_id: l.to_id }
                }))
            ].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

            setHistoryItems(items);
        } catch (err) {
            console.error('Error cargando historial:', err);
            alert('No se pudo cargar el historial: ' + (err?.message || err));
            setHistoryItems([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    // ===== GESTIÓN DE ARCHIVOS =====
    const openFilesModal = async (entityType, entityId, entityName) => {
        if (!requireAuth()) return;
        setFilesEntityType(entityType);
        setFilesEntityId(entityId);
        setFilesEntityName(entityName);
        setFilesModalOpen(true);
        await loadFiles(entityType, entityId);
    };

    const loadFiles = async (entityType, entityId) => {
        setFilesLoading(true);
        try {
            const folderPath = `${entityType}/${entityId}`;
            const { data, error } = await supabase.storage
                .from('crm-archivos')
                .list(folderPath);
            
            if (error) throw error;
            setFilesList(data || []);
        } catch (err) {
            console.error('Error cargando archivos:', err);
            setFilesList([]);
        } finally {
            setFilesLoading(false);
        }
    };

    const uploadFile = async (file) => {
        if (!file) return;
        setUploadingFile(true);
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const fileName = `${Date.now()}_${file.name}`;
            const filePath = `${folderPath}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('crm-archivos')
                .upload(filePath, file);
            
            if (uploadError) throw uploadError;
            
            // Registrar en historial
            await logEvent(
                filesEntityType, 
                filesEntityId, 
                'file_uploaded', 
                `Archivo subido: ${file.name}`,
                { filename: file.name, size: file.size, type: file.type }
            );
            
            await loadFiles(filesEntityType, filesEntityId);
            showToast('Archivo subido correctamente', 'info');
        } catch (err) {
            console.error('Error subiendo archivo:', err);
            alert('Error al subir archivo: ' + err.message);
        } finally {
            setUploadingFile(false);
        }
    };

    const downloadFile = async (fileName) => {
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const { data, error } = await supabase.storage
                .from('crm-archivos')
                .download(`${folderPath}/${fileName}`);
            
            if (error) throw error;
            
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.split('_').slice(1).join('_'); // Remover timestamp
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error descargando archivo:', err);
            alert('Error al descargar: ' + err.message);
        }
    };

    const deleteFile = async (fileName) => {
        if (!(await confirmModal('¿Eliminar este archivo?'))) return;
        try {
            const folderPath = `${filesEntityType}/${filesEntityId}`;
            const { error } = await supabase.storage
                .from('crm-archivos')
                .remove([`${folderPath}/${fileName}`]);
            
            if (error) throw error;
            
            // Registrar en historial
            await logEvent(
                filesEntityType, 
                filesEntityId, 
                'file_deleted', 
                `Archivo eliminado: ${fileName}`,
                { filename: fileName }
            );
            
            await loadFiles(filesEntityType, filesEntityId);
            showToast('Archivo eliminado', 'info');
        } catch (err) {
            console.error('Error eliminando archivo:', err);
            alert('Error al eliminar: ' + err.message);
        }
    };

    const getFileIcon = (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc', 'docx'].includes(ext)) return '📝';
        if (['xls', 'xlsx'].includes(ext)) return '📊';
        if (['zip', 'rar'].includes(ext)) return '📦';
        return '📎';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };


    const handleSaveProspecto = async (data) => {
        if (!requireAuth()) return;
        try {
            let savedId = null;
            if (editingItem) {
                // UPDATE: registrar qué cambió
                const cambios = {};
                Object.keys(data).forEach(key => {
                    if (editingItem[key] !== data[key]) {
                        cambios[key] = { anterior: editingItem[key], nuevo: data[key] };
                    }
                });
                
                const { error } = await supabase.from('prospectos').update(data).eq('id', editingItem.id);
                if (error) throw error;
                
                savedId = editingItem.id;
                
                // Log del update
                if (Object.keys(cambios).length > 0) {
                    await logEvent('prospectos', savedId, 'updated', 'Prospecto actualizado', {
                        changed_fields: Object.keys(cambios),
                        changes: cambios,
                        updated_by: user?.email || 'unknown'
                    });
                }
            } else {
                // INSERT: registrar creación
                const { data: inserted, error } = await supabase.from('prospectos').insert([data]).select('id').single();
                if (error) throw error;
                
                savedId = inserted?.id;
                
                // Log de creación
                await logEvent('prospectos', savedId, 'created', 'Prospecto creado', {
                    organizacion: data.organizacion,
                    valor: data.valor,
                    tipo: data.tipo,
                    created_by: user?.email || 'unknown'
                });
            }
            
            await loadProspectos();
            setShowModal(false);
        } catch (error) { 
            console.error('Error completo:', error);
            alert('Error al guardar: ' + error.message); 
        }
    };

    const handleDeleteProspecto = async (id) => {
        if (!requireAuth()) return;
        if (!(await confirmModal('¿Eliminar?'))) return;
        const { error } = await supabase.from('prospectos').delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else await loadProspectos();
    };

    const handleMoveProspecto = async (prospectoId, nuevoEstado) => {
        if (!requireAuth()) return;
        
        // Obtener estado anterior
        const prospecto = prospectos.find(p => p.id === prospectoId);
        const estadoAnterior = prospecto?.estado;
        
        let probabilidad = 10;
        if (nuevoEstado === 'Reunión agendada') probabilidad = 25;
        if (nuevoEstado === 'Propuesta enviada') probabilidad = 40;
        if (nuevoEstado === 'Negociación') probabilidad = 70;
        
        const { error } = await supabase.from('prospectos').update({ estado: nuevoEstado, probabilidad }).eq('id', prospectoId);
        if (error) {
            console.error('Error:', error);
        } else {
            // Log del movimiento
            await logEvent('prospectos', prospectoId, 'stage_changed', `Movido a "${nuevoEstado}"`, {
                from: estadoAnterior,
                to: nuevoEstado,
                probabilidad: probabilidad,
                moved_by: user?.email || 'unknown'
            });
            await loadProspectos();
        }
    };

    const handleCerrarProspecto = async (prospecto, ganado) => {
        if (!requireAuth()) return;
        try {
            const cerrado = {
                organizacion: prospecto.organizacion,
                tipo: prospecto.tipo,
                estado_final: ganado ? 'Ganado' : 'Perdido',
                fecha_cierre: new Date().toISOString().split('T')[0],
                valor: prospecto.valor,
                razon_perdida: '',
                escalo: false,
                valor_total_final: prospecto.valor,
                fecha_contacto: prospecto.created_at
            };
            const { error: insertError } = await supabase.from('cerrados').insert([cerrado]);
            if (insertError) throw insertError;
            
            // Log antes de borrar
            await logEvent('prospectos', prospecto.id, 'closed', `Cerrado como "${ganado ? 'Ganado' : 'Perdido'}"`, {
                estado_final: ganado ? 'Ganado' : 'Perdido',
                valor: prospecto.valor,
                closed_by: user?.email || 'unknown'
            });
            
            const { error: deleteError } = await supabase.from('prospectos').delete().eq('id', prospecto.id);
            if (deleteError) throw deleteError;
            await loadProspectos();
            await loadCerrados();
        } catch (error) { alert('Error: ' + error.message); }
    };

    const handleSaveOther = async (type, data) => {
        if (!requireAuth()) return;
        try {
            const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts';
            if (editingItem) {
                const { error } = await supabase.from(table).update(data).eq('id', editingItem.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(table).insert([data]);
                if (error) throw error;
            }
            if (type === 'cerrado') await loadCerrados();
            if (type === 'ticket') await loadTickets();
            if (type === 'keyaccount') await loadKeyAccounts();
            setShowModal(false);
        } catch (error) { alert('Error: ' + error.message); }
    };

    const handleDeleteOther = async (type, id) => {
        if (!requireAuth()) return;
        if (!(await confirmModal('¿Eliminar?'))) return;
        const table = type === 'cerrado' ? 'cerrados' : type === 'ticket' ? 'tickets' : 'key_accounts';
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) alert('Error: ' + error.message);
        else {
            if (type === 'cerrado') await loadCerrados();
            if (type === 'ticket') await loadTickets();
            if (type === 'keyaccount') await loadKeyAccounts();
        }
    };

    // -------------------------
    // Cerrar / finalizar Ticket
    // -------------------------
    const handleCloseTicket = async (ticket) => {
        if (!requireAuth()) return;
        if (!ticket) return;

        // 1) Finalizar ticket
        const ok = confirm(`¿Finalizar este ticket?

${ticket.organizacion} — ${ticket.ticket}

Se marcará como 100% y Cerrado.`);
        if (!ok) return;

        // 2) ¿Registrar también en "Cerrados"?
        const alsoClosed = confirm(`¿Quieres registrar el término del ticket en la pestaña "Cerrados"?

Recomendado: así queda como histórico y después puedes reactivarlo/convertirlo.`);
        let closedOutcome = 'Ganado';
        let lossReason = '';
        let ufValue = '';
        if (alsoClosed) {
            const opt = prompt('¿Cómo terminó este ticket?\n\n1 = Ganado (finalizado)\n2 = Perdido/Cancelado', '1');
            closedOutcome = (opt === '2') ? 'Perdido' : 'Ganado';
            ufValue = prompt('UF del ticket (opcional, para métricas). Deja vacío si no aplica.', '') || '';
            if (closedOutcome === 'Perdido') {
                lossReason = prompt('Motivo de pérdida/cancelación (opcional)', '') || '';
            }
        }

        try {
            const payload = {
                status: 'Cerrado',
                porcentaje_avance: 100,
                fase_actual: ticket.fase_actual || 'Finalizado',
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('tickets')
                .update(payload)
                .eq('id', ticket.id);

            if (error) throw error;

            await logEvent('tickets', ticket.id, 'ticket_closed', 'Ticket finalizado', { status: 'Cerrado', outcome: alsoClosed ? closedOutcome : null });

            // 3) Si corresponde, crear registro en "cerrados" + link + evento
            if (alsoClosed) {
                const today = new Date().toISOString().split('T')[0];
                const closedRow = {
                    organizacion: ticket.organizacion,
                    tipo: ticket.ticket,
                    estado_final: closedOutcome,
                    fecha_cierre: today,
                    valor: ufValue ? parseFloat(ufValue) : null,
                    razon_perdida: closedOutcome === 'Perdido' ? lossReason : null,
                    escalo: !!ticket.escalo,
                    valor_total_final: ufValue ? parseFloat(ufValue) : null,
                    fecha_contacto: today
                };

                const { data: cData, error: cErr } = await supabase
                    .from('cerrados')
                    .insert([closedRow])
                    .select('*')
                    .single();

                if (cErr) {
                    console.warn('No se pudo registrar ticket en cerrados:', cErr.message);
                } else if (cData?.id) {
                    // link suave (si existe)
                    try {
                        await supabase.from('crm_entity_links').insert([{
                            from_type: 'ticket',
                            from_id: ticket.id,
                            to_type: 'cerrado',
                            to_id: cData.id,
                            link_type: 'completion'
                        }]);
                    } catch (e) { /* no-op */ }

                    await logEvent('cerrados', cData.id, 'ticket_closed_recorded', 'Ticket registrado en Cerrados', { ticket_id: ticket.id, outcome: closedOutcome });
                    await loadCerrados();
                }
            }

            await loadTickets();
        } catch (err) {
            alert('Error al finalizar ticket: ' + (err?.message || err));
        }
    };


    // ============================================
    // CONCILIACIÓN BANCARIA - FUNCIONES
    // ============================================
    
    // Parsear cartola de Santander (Excel)
    const parsearCartolaSantander = (arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Buscar fila del header
        let headerIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === 'MONTO') {
                headerIndex = i;
                break;
            }
        }
        
        if (headerIndex === -1) {
            throw new Error('No se encontró el formato esperado de Santander en la cartola');
        }
        
        // Parsear movimientos
        const movimientos = [];
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row[0] || typeof row[0] !== 'number') continue;
            
            const monto = parseFloat(row[0]);
            const tipo = row[6] === 'A' ? 'entrada' : 'salida';
            
            // Parsear fecha DD/MM/YYYY a YYYY-MM-DD
            let fecha = null;
            if (row[2]) {
                const partes = row[2].toString().split('/');
                if (partes.length === 3) {
                    fecha = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                }
            }
            
            movimientos.push({
                fecha: fecha,
                descripcion: (row[1] || '').toString(),
                monto_clp: Math.abs(monto),
                tipo: tipo,
                saldo_clp: parseFloat(row[3]) || 0,
                numero_documento: (row[4] || '').toString(),
                sucursal: (row[5] || '').toString(),
                monto_uf: Math.abs(monto) / ufActual,
                uf_dia: ufActual,
                estado_conciliacion: 'pendiente'
            });
        }
        
        return movimientos;
    };
    
    // Importar cartola
    const importarCartola = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const movimientos = parsearCartolaSantander(arrayBuffer);
                
                if (movimientos.length === 0) {
                    showToast('No se encontraron movimientos en la cartola', 'info');
                    return;
                }
                
                // Agregar nombre del archivo
                movimientos.forEach(m => m.archivo_origen = file.name);
                
                // Verificar duplicados antes de insertar
                const { data: existentes } = await supabase
                    .from('movimientos_bancarios')
                    .select('fecha, descripcion, monto_clp');
                
                const movimientosNuevos = movimientos.filter(m => {
                    return !existentes.some(e => 
                        e.fecha === m.fecha && 
                        e.descripcion === m.descripcion && 
                        Math.abs(e.monto_clp - m.monto_clp) < 1
                    );
                });
                
                if (movimientosNuevos.length === 0) {
                    showToast('⚠️ Todos los movimientos ya existen en el sistema', 'info');
                    return;
                }
                
                // Insertar solo los nuevos
                const { data, error } = await supabase
                    .from('movimientos_bancarios')
                    .insert(movimientosNuevos)
                    .select();
                
                if (error) throw error;
                
                const duplicados = movimientos.length - movimientosNuevos.length;
                alert(`✅ ${movimientosNuevos.length} movimientos nuevos importados${duplicados > 0 ? `\n⚠️ ${duplicados} duplicados omitidos` : ''}`);
                loadMovimientosBancarios();
                
            } catch (error) {
                console.error('Error importando cartola:', error);
                showToast(`❌ Error al importar: ${error.message}`, "info");
            }
        };
        
        input.click();
    };
    
    // Buscar matches automáticos para un movimiento
    const buscarMatches = (movimiento) => {
        const matches = [];
        const montoCLP = parseFloat(movimiento.monto_clp);
        const fechaMov = new Date(movimiento.fecha);
        
        // Función para calcular score de similaridad
        const calcularScore = (fechaRegistro, montoRegistroCLP) => {
            const fechaReg = new Date(fechaRegistro);
            const diffDias = Math.abs((fechaMov - fechaReg) / (1000 * 60 * 60 * 24));
            const diffMonto = Math.abs(montoCLP - montoRegistroCLP) / montoCLP;
            
            if (diffDias > 30 || diffMonto > 0.05) return 0; // Fuera de rango
            
            let score = 1.0;
            score -= (diffDias / 30) * 0.3; // -30% máximo por fecha
            score -= diffMonto * 2; // -10% por cada 5% de diferencia
            
            return Math.max(0, Math.min(1, score));
        };
        
        // Buscar en facturas emitidas (entradas)
        if (movimiento.tipo === 'entrada') {
            facturasEmitidas.forEach(f => {
                if (f.estado === 'Cobrada' || f.estado === 'Reclamado' || f.estado === 'Reclamada') return;
                
                const fechaFac = f.fecha_pago || f.fecha_emision;
                const montoFacCLP = parseFloat(f.monto_clp) || 0;
                const score = calcularScore(fechaFac, montoFacCLP);
                
                if (score > 0.6) {
                    matches.push({
                        tipo: 'factura_emitida',
                        id: f.id,
                        descripcion: `Factura #${f.numero_factura} - ${f.cliente}`,
                        monto_clp: montoFacCLP,
                        monto_uf: parseFloat(f.monto_uf) || 0,
                        fecha: fechaFac,
                        score: score
                    });
                }
            });
        }
        
        // Buscar en facturas recibidas (salidas)
        if (movimiento.tipo === 'salida') {
            facturasRecibidas.forEach(f => {
                if (f.estado === 'Pagada' || f.estado === 'Reclamado' || f.estado === 'Reclamada') return;
                
                const fechaFac = f.fecha_pago || f.fecha_emision;
                const montoFacCLP = parseFloat(f.monto_clp) || 0;
                const score = calcularScore(fechaFac, montoFacCLP);
                
                if (score > 0.6) {
                    matches.push({
                        tipo: 'factura_recibida',
                        id: f.id,
                        descripcion: `Factura #${f.numero_factura} - ${f.proveedor}`,
                        monto_clp: montoFacCLP,
                        monto_uf: parseFloat(f.monto_uf) || 0,
                        fecha: fechaFac,
                        score: score
                    });
                }
            });
            
            // Buscar en sueldos
            sueldosSocios.forEach(s => {
                const montoSueldoCLP = parseFloat(s.monto_clp) || 0;
                const score = calcularScore(s.fecha, montoSueldoCLP);
                
                if (score > 0.6) {
                    matches.push({
                        tipo: 'sueldo_socio',
                        id: s.id,
                        descripcion: `Sueldo ${s.socio} - ${s.mes_servicio}`,
                        monto_clp: montoSueldoCLP,
                        monto_uf: parseFloat(s.monto_uf) || 0,
                        fecha: s.fecha,
                        score: score
                    });
                }
            });
            
            // Buscar en boletas
            boletasHonorarios.forEach(b => {
                const montoBrutoCLP = parseFloat(b.monto_bruto_clp) || 0;
                const score = calcularScore(b.fecha, montoBrutoCLP);
                
                if (score > 0.6) {
                    matches.push({
                        tipo: 'boleta_honorario',
                        id: b.id,
                        descripcion: `Boleta ${b.prestador} - ${b.mes_servicio}`,
                        monto_clp: montoBrutoCLP,
                        monto_uf: parseFloat(b.monto_bruto_uf) || 0,
                        fecha: b.fecha,
                        score: score
                    });
                }
            });
        }
        
        // Ordenar por score
        matches.sort((a, b) => b.score - a.score);
        
        // Buscar también en caja chica existente (para salidas)
        if (movimiento.tipo === 'salida') {
            cajaChica.forEach(c => {
                const montoCajaCLP = parseFloat(c.monto_clp) || 0;
                const fechaCaja = new Date(c.fecha);
                const diffDias = Math.abs((new Date(movimiento.fecha) - fechaCaja) / (1000 * 60 * 60 * 24));
                const diffMonto = Math.abs(montoCLP - montoCajaCLP) / montoCLP;
                
                if (diffDias <= 7 && diffMonto <= 0.02) { // Mismo día ±7 y monto ±2%
                    matches.push({
                        tipo: 'caja_chica',
                        id: c.id,
                        descripcion: `Caja Chica: ${c.concepto}`,
                        monto_clp: montoCajaCLP,
                        monto_uf: montoCajaCLP / ufActual,
                        fecha: c.fecha,
                        score: 0.85 // Alto porque coincide fecha y monto
                    });
                }
            });
            
            // Re-ordenar después de agregar caja chica
            matches.sort((a, b) => b.score - a.score);
        }
        
        // Solo sugerir crear en caja chica si es SALIDA sin matches y NO existe ya
        if (movimiento.tipo === 'salida' && (matches.length === 0 || matches[0].score < 0.70)) {
            const desc = movimiento.descripcion.toLowerCase();
            let categoria = 'Otros';
            
            if (desc.includes('cafe') || desc.includes('restaurant') || desc.includes('comida')) {
                categoria = 'Alimentación';
            } else if (desc.includes('uber') || desc.includes('taxi') || desc.includes('transporte')) {
                categoria = 'Transporte';
            } else if (desc.includes('google') || desc.includes('microsoft') || desc.includes('software')) {
                categoria = 'Servicios';
            } else if (desc.includes('oficina') || desc.includes('materiales')) {
                categoria = 'Materiales';
            }
            
            return { matches: matches, sugerenciaCategoria: categoria };
        }
        
        return { matches: matches, sugerenciaCategoria: null };
    };
    
    // Aplicar conciliación
    const aplicarConciliacion = async (movimientoId, conciliadoConTipo, conciliadoConId) => {
        try {
            // Actualizar movimiento
            const { error: errorMov } = await supabase
                .from('movimientos_bancarios')
                .update({
                    estado_conciliacion: 'conciliado',
                    conciliado_con_tipo: conciliadoConTipo,
                    conciliado_con_id: conciliadoConId,
                    conciliado_at: new Date().toISOString()
                })
                .eq('id', movimientoId);
            
            if (errorMov) throw errorMov;
            
            // Actualizar estado del registro conciliado
            let tabla, nuevoEstado;
            
            switch (conciliadoConTipo) {
                case 'factura_emitida':
                    tabla = 'facturas_emitidas';
                    nuevoEstado = 'Cobrada';
                    break;
                case 'factura_recibida':
                    tabla = 'facturas_recibidas';
                    nuevoEstado = 'Pagada';
                    break;
                default:
                    // Sueldos, boletas y caja chica no tienen estado de pago
                    tabla = null;
            }
            
            if (tabla) {
                const { error: errorReg } = await supabase
                    .from(tabla)
                    .update({ estado: nuevoEstado })
                    .eq('id', conciliadoConId);
                
                if (errorReg) throw errorReg;
            }
            
            showToast('✅ Conciliación aplicada correctamente', 'info');
            loadMovimientosBancarios();
            loadFacturasEmitidas();
            loadFacturasRecibidas();
            
        } catch (error) {
            console.error('Error aplicando conciliación:', error);
            showToast(`❌ Error: ${error.message}`, "info");
        }
    };
    
    // Crear gasto en caja chica desde movimiento
    const crearGastoCajaChica = async (movimiento, categoria) => {
        try {
            const nuevoGasto = {
                fecha: movimiento.fecha,
                concepto: movimiento.descripcion,
                monto_clp: movimiento.monto_clp,
                categoria: categoria,
                responsable: 'Importado desde cartola',
                comprobante: movimiento.numero_documento
            };
            
            const { data, error } = await supabase
                .from('caja_chica')
                .insert([nuevoGasto])
                .select();
            
            if (error) throw error;
            
            // Conciliar
            await aplicarConciliacion(movimiento.id, 'caja_chica', data[0].id);
            loadCajaChica();
            
        } catch (error) {
            console.error('Error creando gasto:', error);
            showToast(`❌ Error: ${error.message}`, "info");
        }
    };
    
    // Ignorar movimiento
    const ignorarMovimiento = async (movimientoId) => {
        try {
            const { error } = await supabase
                .from('movimientos_bancarios')
                .update({ estado_conciliacion: 'ignorar' })
                .eq('id', movimientoId);
            
            if (error) throw error;
            
            loadMovimientosBancarios();
        } catch (error) {
            console.error('Error ignorando movimiento:', error);
            showToast(`❌ Error: ${error.message}`, "info");
        }
    };
    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
                <div className="absolute inset-0 rounded-full border-4 border-naranja border-t-transparent animate-spin"></div>
            </div>
            <p className="text-lg font-medium text-gray-600 dark:text-gray-400">Cargando CRM...</p>
            <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">The Human Org</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 transition-colors shadow-sm">
                <div className="max-w-7xl mx-auto px-3 md:px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/logo-tho.png" alt="THO" className="h-9 w-9 object-contain dark:invert" />
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
                                    <button onClick={() => { setEditingItem(null); setModalType('prospecto'); setShowModal(true); }} className="hidden md:inline-flex px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium">+ Prospecto</button>
                                    <button onClick={() => {
                                        const data = { prospectos, cerrados, tickets, keyAccounts };
                                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `crm-tho-${new Date().toISOString().split('T')[0]}.json`;
                                        a.click();
                                    }} className="hidden md:inline-flex px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm" title="Exportar datos">📥</button>
                                </>
                            )}
                            <div className="text-sm">
                                {user ? (
                                    <div className="flex items-center gap-2">
                                        <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400">{user.email.split('@')[0]}</span>
                                        <button onClick={() => { localStorage.removeItem('crm_tho_email'); setUser(null); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Salir</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowLoginModal(true)} className="px-3 py-1.5 color-naranja text-white rounded-lg text-sm font-medium">Ingresar</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-white border-b overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <nav className="flex space-x-4 md:space-x-8 overflow-x-auto scrollbar-hide px-4">
                        {[
                            { id: 'dashboard', nombre: '📊 Dashboard' },
                            { id: 'pipeline', nombre: '🎯 Pipeline' },
                            { id: 'reportes', nombre: '📈 Reportes' },
                            { id: 'contabilidad', nombre: '💰 Contabilidad' },
                            { id: 'cerrados', nombre: '📜 Historial' },
                            { id: 'tickets', nombre: '🎫 Tickets' },
                            { id: 'keyaccounts', nombre: '🔑 Key Accounts' }
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-4 px-2 md:px-1 border-b-2 font-medium text-sm whitespace-nowrap flex-shrink-0 ${activeTab === tab.id ? 'border-naranja text-naranja' : 'border-transparent text-gray-500'}`}>{tab.nombre}</button>
                        ))}
                    </nav>
                </div>
            </div>

            {activeTab === 'pipeline' && (
                <div className="bg-white border-b">
                    <div className="max-w-7xl mx-auto px-4 py-3">
                        <div className="flex space-x-4">
                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 px-4 py-2 border rounded-lg" />
                            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="px-4 py-2 border rounded-lg">
                                <option value="todos">Todos</option>
                                <option value="Ticket">Tickets</option>
                                <option value="Key Account">Key Accounts</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <main className="max-w-7xl mx-auto px-3 py-4 md:px-4 md:py-8">
                {activeTab === 'dashboard' && <Dashboard metrics={metrics} prospectos={prospectos} cerrados={cerrados} tickets={tickets} keyAccounts={keyAccounts} user={user} ufActual={ufActual} monedaPreferida={monedaPreferida} setMonedaPreferida={setMonedaPreferida} actividadReciente={actividadReciente} />}
                {activeTab === 'pipeline' && <KanbanBoard onConvert={openConvert} onHistory={openHistory} estados={estadosKanban} prospectosPorEstado={prospectosPorEstado} onEdit={(p) => { if (requireAuth()) { setEditingItem(p); setModalType('prospecto'); setShowModal(true); }}} onDelete={handleDeleteProspecto} onMove={handleMoveProspecto} onCerrar={handleCerrarProspecto} getEstadoFromKey={getEstadoFromKey} />}
                {activeTab === 'reportes' && <ReportesView prospectos={prospectos} cerrados={cerrados} tickets={tickets} keyAccounts={keyAccounts} ufActual={ufActual} />}
                {activeTab === 'contabilidad' && (
                    <ContabilidadView 
                        facturasEmitidas={facturasEmitidas} 
                        facturasRecibidas={facturasRecibidas} 
                        cajaChica={cajaChica} 
                        boletasHonorarios={boletasHonorarios} 
                        sueldosSocios={sueldosSocios} 
                        movimientosBancarios={movimientosBancarios} 
                        tickets={tickets} 
                        keyAccounts={keyAccounts} 
                        ufActual={ufActual} 
                        contaTab={contaTab} 
                        setContaTab={setContaTab} 
                        monedaPreferida={monedaPreferida} 
                        alertasValidacion={alertasValidacion} 
                        setAlertasValidacion={setAlertasValidacion} 
                        sincronizarBoletasSII={sincronizarBoletasSII} 
                        sincronizarFacturasEmitidas={sincronizarFacturasEmitidas} 
                        sincronizarFacturasRecibidas={sincronizarFacturasRecibidas} 
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
                {activeTab === 'cerrados' && <CerradosView onConvertClosed={openConvertFromCerrado} onHistory={openHistory} onFiles={openFilesModal} cerrados={cerrados} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('cerrado'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('cerrado'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('cerrado', id)} onExport={() => exportToCSV(cerrados, 'cerrados.csv')} />}
                {activeTab === 'tickets' && <TicketsView onClose={handleCloseTicket} onHistory={openHistory} onFiles={openFilesModal} tickets={tickets} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('ticket'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('ticket'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('ticket', id)} onExport={() => exportToCSV(tickets, 'tickets.csv')} />}
                {activeTab === 'keyaccounts' && <KeyAccountsView onHistory={openHistory} onRenew={openRenewal} onCancel={openCancelKA} onFiles={openFilesModal} keyAccounts={keyAccounts} onAdd={() => { if (requireAuth()) { setEditingItem(null); setModalType('keyaccount'); setShowModal(true); }}} onEdit={(item) => { if (requireAuth()) { setEditingItem(item); setModalType('keyaccount'); setShowModal(true); }}} onDelete={(id) => handleDeleteOther('keyaccount', id)} onExport={() => exportToCSV(keyAccounts, 'key-accounts.csv')} />}
            </main>

            {showModal && <UniversalModal type={modalType} item={editingItem} onSave={(data) => modalType === 'prospecto' ? handleSaveProspecto(data) : handleSaveOther(modalType, data)} onClose={() => setShowModal(false)} />}
            
            {historyOpen && <HistoryModal open={historyOpen} title={historyTitle} items={historyItems} loading={historyLoading} onClose={() => { setHistoryOpen(false); setHistoryItems([]); }} />}
            {filesModalOpen && <FilesModal open={filesModalOpen} onClose={() => setFilesModalOpen(false)} entityName={filesEntityName} files={filesList} loading={filesLoading} uploading={uploadingFile} onUpload={uploadFile} onDownload={downloadFile} onDelete={deleteFile} getIcon={getFileIcon} formatSize={formatFileSize} />}
            {convertOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold">Convertir prospecto</h3>
                                <p className="text-sm text-gray-600">{convertSource?.item?.organizacion}</p>
                            </div>
                            <button onClick={closeConvert} className="text-gray-500 hover:text-gray-800">✕</button>
                        </div>

                        <div className="mt-4">
                            <label className="text-sm font-medium text-gray-700">Destino</label>
                            <select value={convertTarget} onChange={(e) => setConvertTarget(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg">
                                <option value="ticket">Ticket (ejecución)</option>
                                <option value="key_account">Key Account (contrato)</option>
                            </select>
                        </div>

                        {convertTarget === 'ticket' ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Nombre del ticket</label>
                                    <input value={convertForm.ticket} onChange={(e) => setConvertForm({...convertForm, ticket: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Inicio</label>
                                        <input type="date" value={convertForm.fecha_inicio} onChange={(e) => setConvertForm({...convertForm, fecha_inicio: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Entrega</label>
                                        <input type="date" value={convertForm.fecha_entrega} onChange={(e) => setConvertForm({...convertForm, fecha_entrega: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Responsable</label>
                                    <input value={convertForm.responsable} onChange={(e) => setConvertForm({...convertForm, responsable: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" placeholder="Ej: Jere / Vale / ..." />
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Servicio</label>
                                    <input value={convertForm.servicio} onChange={(e) => setConvertForm({...convertForm, servicio: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">UF/mes</label>
                                        <input type="number" step="0.01" value={convertForm.uf_mes} onChange={(e) => setConvertForm({...convertForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Fin contrato</label>
                                        <input type="date" value={convertForm.fin_contrato} onChange={(e) => setConvertForm({...convertForm, fin_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Inicio contrato</label>
                                    <input type="date" value={convertForm.inicio_contrato} onChange={(e) => setConvertForm({...convertForm, inicio_contrato: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
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
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold">{renewalMode === 'cancel' ? 'Cancelar contrato' : 'Renovar contrato'}</h3>
                                <p className="text-sm text-gray-600">{renewalKA?.organizacion}</p>
                            </div>
                            <button onClick={closeRenewal} className="text-gray-500 hover:text-gray-800">✕</button>
                        </div>

                        {renewalMode === 'cancel' ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Motivo de cancelación</label>
                                    <input value={renewalForm.cancel_reason} onChange={(e) => setRenewalForm({...renewalForm, cancel_reason: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" placeholder="Ej: cliente pausó / cambio de foco / ..." />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Notas</label>
                                    <textarea value={renewalForm.notes} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" rows="3" />
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
                                        <label className="text-sm font-medium text-gray-700">Inicio</label>
                                        <input type="date" value={renewalForm.start_date} onChange={(e) => setRenewalForm({...renewalForm, start_date: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Fin</label>
                                        <input type="date" value={renewalForm.end_date} onChange={(e) => setRenewalForm({...renewalForm, end_date: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">UF/mes</label>
                                    <input type="number" step="0.01" value={renewalForm.uf_mes} onChange={(e) => setRenewalForm({...renewalForm, uf_mes: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Notas</label>
                                    <textarea value={renewalForm.notes} onChange={(e) => setRenewalForm({...renewalForm, notes: e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-lg" rows="3" />
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

            {showLoginModal && <LoginModal onLogin={handleLogin} onClose={() => setShowLoginModal(false)} />}
        </div>
    );

// Componente para mostrar valores en UF y CLP

// [COMPONENTES IGUALES - Dashboard, MetricCard, KanbanBoard, etc.]

} // Cierre de CRMApp


export default CRMApp
