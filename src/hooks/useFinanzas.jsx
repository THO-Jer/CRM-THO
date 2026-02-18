import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'

export default function useFinanzas({ user, movimientosBancarios, setMovimientosBancarios, facturasEmitidas, facturasRecibidas, boletasHonorarios, sueldosSocios, loadMovimientosBancarios, loadCajaChica }) {
    // ============================================
    // CONCILIACIÓN BANCARIA - FUNCIONES
    // ============================================
    
    // Parsear cartola de Santander (Excel)
    const parsearCartolaSantander = (arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Buscar fila del header (MONTO)
        let headerIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i][0] === 'MONTO') { headerIndex = i; break; }
        }
        if (headerIndex === -1) throw new Error('No se encontró el formato esperado de Santander');
        
        // Detect columns dynamically
        const hdr = rows[headerIndex];
        let fechaCol = -1, caCol = -1, docCol = -1, sucCol = -1;
        for (let c = 0; c < (hdr || []).length; c++) {
            const v = (hdr[c] || '').toString().toUpperCase().trim();
            if (v === 'FECHA') fechaCol = c;
            if (v.includes('CARGO') || v.includes('ABONO')) caCol = c;
            if (v.includes('DOCUMENTO')) docCol = c;
            if (v.includes('SUCURSAL')) sucCol = c;
        }
        console.log('Cartola cols:', { fechaCol, caCol, docCol, sucCol });
        
        const movimientos = [];
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row[0] !== 'number' || row[0] === 0) continue;
            
            const monto = parseFloat(row[0]);
            if (isNaN(monto)) continue;
            
            // Tipo: from CARGO/ABONO column or sign
            const tipo = caCol >= 0 && (row[caCol] || '').toString().toUpperCase() === 'A' ? 'entrada' : (monto > 0 ? 'entrada' : 'salida');
            
            // Fecha: parse DD/MM/YYYY or YYYY-MM-DD
            let fecha = null;
            const raw = fechaCol >= 0 ? row[fechaCol] : null;
            if (raw) {
                const s = raw.toString().trim();
                const p = s.split('/');
                if (p.length === 3) fecha = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
                else if (s.match(/^\d{4}-\d{2}-\d{2}$/)) fecha = s;
            }
            if (!fecha) continue; // Skip rows without valid dates
            
            const obj = {
                fecha,
                descripcion: (row[1] || '').toString().trim(),
                monto_clp: Math.abs(monto),
                tipo,
                estado_conciliacion: 'pendiente'
            };
            if (docCol >= 0 && row[docCol]) obj.numero_documento = row[docCol].toString();
            if (sucCol >= 0 && row[sucCol]) obj.sucursal = row[sucCol].toString();
            if (ufActual > 0) { obj.monto_uf = Math.abs(monto) / ufActual; obj.uf_dia = ufActual; }
            movimientos.push(obj);
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
                
                // Insertar solo los nuevos - only include columns that exist in the table
                const cleanedMovimientos = movimientosNuevos.map(m => {
                    const clean = {
                        fecha: m.fecha,
                        descripcion: m.descripcion,
                        monto_clp: m.monto_clp,
                        tipo: m.tipo,
                        estado_conciliacion: m.estado_conciliacion || 'pendiente',
                        archivo_origen: m.archivo_origen
                    };
                    // Only add optional fields if they have values
                    if (m.monto_uf) clean.monto_uf = m.monto_uf;
                    if (m.uf_dia) clean.uf_dia = m.uf_dia;
                    if (m.numero_documento) clean.numero_documento = m.numero_documento;
                    if (m.sucursal) clean.sucursal = m.sucursal;
                    return clean;
                });
                
                const { data, error } = await supabase
                    .from('movimientos_bancarios')
                    .insert(cleanedMovimientos)
                    .select();
                
                if (error) throw error;
                
                const duplicados = movimientos.length - movimientosNuevos.length;
                showToast(`✅ ${movimientosNuevos.length} movimientos importados${duplicados > 0 ? ` (${duplicados} duplicados omitidos)` : ''}`, 'success');
                loadMovimientosBancarios();
                
            } catch (error) {
                console.error('Error importando cartola:', error);
                const msg = error.message || 'Error desconocido';
                if (msg.includes('null value in column')) {
                    showToast('❌ Error: La cartola tiene filas sin fecha válida. Verifica el formato del archivo.', 'error');
                } else if (msg.includes('already exists') || msg.includes('duplicate')) {
                    showToast('⚠️ Algunos movimientos ya existían en el sistema', 'info');
                } else {
                    showToast(`❌ Error al importar: ${msg}`, 'error');
                }
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
                        id: String(f.id),
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
                        id: String(f.id),
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
                        id: String(s.id),
                        descripcion: `Retiro ${s.socio} - ${s.mes_servicio}`,
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
                        id: String(b.id),
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
                        id: String(c.id),
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
            // Ensure IDs are strings (some records have numeric IDs from SII sync)
            const movId = String(movimientoId);
            const conId = String(conciliadoConId);
            
            // Actualizar movimiento
            const { error: errorMov } = await supabase
                .from('movimientos_bancarios')
                .update({
                    estado_conciliacion: 'conciliado',
                    conciliado_con_tipo: conciliadoConTipo,
                    conciliado_con_id: conId,
                    conciliado_at: new Date().toISOString()
                })
                .eq('id', movId);
            
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
                case 'boleta_honorario':
                    tabla = 'boletas_honorarios';
                    nuevoEstado = 'Pagada';
                    break;
                case 'sueldo_socio':
                    tabla = 'sueldos_socios';
                    nuevoEstado = 'Pagado';
                    break;
                default:
                    tabla = null;
            }
            
            if (tabla) {
                const { error: errorReg } = await supabase
                    .from(tabla)
                    .update({ estado: nuevoEstado })
                    .eq('id', conId);
                
                // Don't throw on this - the record might use different ID format
                if (errorReg) console.warn(`Could not update ${tabla} status:`, errorReg.message);
            }
            
            showToast('✅ Conciliación aplicada correctamente', 'success');
            loadMovimientosBancarios();
            loadFacturasEmitidas();
            loadFacturasRecibidas();
            loadBoletasHonorarios();
            loadSueldosSocios();
            
        } catch (error) {
            console.error('Error aplicando conciliación:', error);
            showToast(`❌ Error: ${error.message}`, 'error');
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
            await aplicarConciliacion(String(movimiento.id), 'caja_chica', String(data[0].id));
            loadCajaChica();
            
        } catch (error) {
            console.error('Error creando gasto:', error);
            showToast(`❌ Error: ${error.message}`, 'error');
        }
    };
    
    // Ignorar movimiento
    const ignorarMovimiento = async (movimientoId) => {
        try {
            const { error } = await supabase
                .from('movimientos_bancarios')
                .update({ estado_conciliacion: 'ignorar' })
                .eq('id', String(movimientoId));
            
            if (error) throw error;
            
            showToast('Movimiento ignorado', 'info');
            loadMovimientosBancarios();
        } catch (error) {
            console.error(error);
            showToast('Error al ignorar movimiento', 'error');
        }
    };

    return {
        importarCartola, buscarMatches, aplicarConciliacion, crearGastoCajaChica, ignorarMovimiento
    };
}
