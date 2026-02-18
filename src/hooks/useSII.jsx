import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'

export default function useSII({ user, loadBoletasHonorarios, loadFacturasEmitidas, loadFacturasRecibidas }) {
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
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} boletas nuevas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "success");
            loadBoletasHonorarios();
            
        } catch (error) {
            console.error('Error sincronizando:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}\n\nRevisa la consola del navegador para más detalles (F12).`, "error");
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
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} facturas emitidas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "success");
            loadFacturasEmitidas();
            
        } catch (error) {
            console.error('Error sincronizando facturas emitidas:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}`, "error");
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
            
            showToast(`✅ Sincronización completada:\n\n• ${totalInsertadas} facturas recibidas insertadas\n• ${totalDuplicadas} duplicadas omitidas\n• ${totalErrores} errores`, "success");
            loadFacturasRecibidas();
            
        } catch (error) {
            console.error('Error sincronizando facturas recibidas:', error);
            showToast(`❌ Error al sincronizar:\n\n${error.message}`, "error");
        }
    };
    
    const getNombreMes = (num) => {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return meses[num - 1] || '';
    };


    return { sincronizarBoletasSII, sincronizarFacturasEmitidas, sincronizarFacturasRecibidas };
}
