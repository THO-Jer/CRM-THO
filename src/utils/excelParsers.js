import * as XLSX from 'xlsx';

// =============================================================================
// Helpers
// =============================================================================

const HTML_ENTITIES = {
    '&deg;': '°',
    '&oacute;': 'ó',
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&uacute;': 'ú',
    '&ntilde;': 'ñ',
    '&Oacute;': 'Ó',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Uacute;': 'Ú',
    '&Ntilde;': 'Ñ',
    '&amp;': '&',
};

function decodeEntities(str) {
    if (!str) return '';
    let result = String(str);
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        result = result.split(entity).join(char);
    }
    return result;
}

/**
 * Parsea un valor numérico tolerando strings con separadores de miles
 * (puntos o comas) y decimales. Devuelve null si no se puede parsear.
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    const cleaned = String(value).trim().replace(/\./g, '').replace(/,/g, '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parsea fechas en dos formatos:
 *  - DMY chileno: "13/02/2026" → "2026-02-13"
 *  - MDY corto del SII: "5/15/26" → "2026-05-15"
 * Devuelve null si no se puede parsear.
 */
function parseDate(value) {
    if (!value) return null;
    const str = String(value).trim();
    if (!str) return null;

    // Intentar formato ISO directo
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

    // Separadores: / o -
    const parts = str.split(/[\/\-]/).map((p) => p.trim());
    if (parts.length !== 3) return null;

    const [a, b, c] = parts;
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    const nc = parseInt(c, 10);
    if ([na, nb, nc].some((n) => Number.isNaN(n))) return null;

    let day, month, year;
    if (c.length === 4) {
        // Año de 4 dígitos: asumimos DMY (formato chileno habitual)
        day = na;
        month = nb;
        year = nc;
    } else {
        // Año de 2 dígitos: típicamente MDY del export SII (5/15/26)
        month = na;
        day = nb;
        year = nc < 50 ? 2000 + nc : 1900 + nc;
        // Heurística: si el primer número es > 12, no puede ser mes → DMY
        if (na > 12) {
            day = na;
            month = nb;
        }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

function toText(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s === '' ? null : s;
}

/**
 * Lee un archivo (File del input) y devuelve el primer worksheet.
 */
export async function readWorkbook(file) {
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: 'array' });
}

// =============================================================================
// Parsers
// =============================================================================

/**
 * Parsea el Excel "BHE_recibidas" del SII (boletas de honorarios recibidas).
 * Estructura:
 *   Fila 0: título del informe (RUT, mes/año)
 *   Fila 1: section headers ("Boleta", "Emisor", "Honorarios")
 *   Fila 2: column headers (N°, Fecha, Estado, ...)
 *   Fila 3+: datos
 */
export function parseBoletasHonorarios(workbook, { ufActual, fileName = '' } = {}) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (rows.length < 4) {
        throw new Error('El archivo no tiene suficientes filas. ¿Es el Excel correcto de BHE recibidas?');
    }

    // Encontrar la fila de encabezados (busca "Fecha" y "Brutos" en alguna fila inicial)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
        const decoded = rows[i].map((c) => decodeEntities(String(c)).toLowerCase().trim());
        if (decoded.some((c) => c === 'fecha') && decoded.some((c) => c === 'brutos')) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx === -1) {
        throw new Error('No se encontró la fila de encabezados (busqué "Fecha" y "Brutos"). ¿Es el Excel correcto?');
    }

    const headers = rows[headerIdx].map((h) => decodeEntities(String(h)).toLowerCase().trim());
    const col = (predicate) => headers.findIndex(predicate);
    const idx = {
        numero: col((h) => h.startsWith('n°') || h === 'n' || h.includes('número')),
        fecha: col((h) => h === 'fecha'),
        estado: col((h) => h === 'estado'),
        fechaAnulacion: col((h) => h.includes('anulaci')),
        rut: col((h) => h === 'rut'),
        nombre: col((h) => h.includes('nombre') || h.includes('razón social') || h.includes('razon social')),
        socProf: col((h) => h.includes('soc')),
        brutos: col((h) => h === 'brutos'),
        retenido: col((h) => h === 'retenido'),
        pagado: col((h) => h === 'pagado'),
    };

    if (idx.fecha === -1 || idx.nombre === -1 || idx.brutos === -1) {
        throw new Error('Faltan columnas obligatorias (Fecha / Nombre / Brutos) en el Excel.');
    }

    const result = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const nombre = toText(r[idx.nombre]);
        const fechaStr = toText(r[idx.fecha]);
        if (!nombre || !fechaStr) continue; // skip filas vacías
        const fecha = parseDate(fechaStr);
        if (!fecha) continue; // no es fila de datos

        const montoBrutoCLP = parseNumber(r[idx.brutos]) || 0;
        const montoRetenidoCLP = parseNumber(r[idx.retenido]) || 0;
        const montoPagadoCLP = parseNumber(r[idx.pagado]) || 0;
        const rut = toText(r[idx.rut]);
        const socProf = toText(r[idx.socProf]);
        const periodo = fecha.split('-');

        result.push({
            fecha,
            fecha_emision: fecha,
            prestador: nombre,
            rut,
            rut_prestador: rut,
            numero_boleta: toText(r[idx.numero]),
            estado: toText(r[idx.estado]),
            fecha_anulacion: parseDate(r[idx.fechaAnulacion]),
            sociedad_profesional: socProf ? socProf.toUpperCase() === 'SI' : null,
            monto_bruto_clp: montoBrutoCLP,
            monto_bruto_uf: ufActual ? montoBrutoCLP / ufActual : 0,
            monto_retencion_clp: montoRetenidoCLP || null,
            monto_retenido_clp: montoRetenidoCLP || null,
            monto_liquido_clp: montoPagadoCLP || null,
            monto_pagado_clp: montoPagadoCLP || null,
            uf_dia: ufActual || 0,
            moneda_principal: 'CLP',
            periodo_anio: parseInt(periodo[0], 10),
            periodo_mes: parseInt(periodo[1], 10),
            origen: 'sii_xls',
            fuente: 'sii_xls',
            nombre_archivo_origen: fileName,
        });
    }
    return result;
}

/**
 * Parsea el Excel "facturas_emitidas" del SII.
 * Estructura: 1 fila de headers, luego se repite por factura:
 *   - Fila main (TipoDTE numérico en col 0)
 *   - Fila "DETALLE" (sub-header)
 *   - 1+ filas de items (col 0 vacío)
 *   - Fila vacía / re-encabezados / siguiente factura
 */
export function parseFacturasEmitidas(workbook, { fileName = '' } = {}) {
    return parseFacturasGenerico(workbook, { fileName, mode: 'emitidas' });
}

/**
 * Parsea el Excel "facturas_recibidas" del SII. Mismo formato que emitidas
 * pero el schema de destino es más simple (sólo numero_factura, proveedor,
 * fecha_emision, monto_clp).
 */
export function parseFacturasRecibidas(workbook, { fileName = '' } = {}) {
    return parseFacturasGenerico(workbook, { fileName, mode: 'recibidas' });
}

function parseFacturasGenerico(workbook, { fileName, mode }) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (rows.length < 2) {
        throw new Error('El archivo no tiene suficientes filas. ¿Es el Excel correcto del SII?');
    }

    // Headers están en la primera fila. Las columnas se repiten (Direccion/Comuna/Ciudad
    // aparecen 2 veces: emisor y receptor). Construimos índices considerando posición.
    const headers = rows[0].map((h) => String(h).trim());
    // Mapeo robusto por orden: el SII exporta siempre las mismas columnas en el mismo orden.
    // Si en algún momento cambia, hay que ajustar acá.
    const findAll = (name) => headers.map((h, i) => (h === name ? i : -1)).filter((i) => i !== -1);
    const findFirst = (name) => headers.indexOf(name);

    const directionIdxs = findAll('Direccion');
    const comunaIdxs = findAll('Comuna');
    const ciudadIdxs = findAll('Ciudad');

    const idx = {
        tipoDTE: findFirst('TipoDTE'),
        folio: findFirst('Folio'),
        fechaEmision: findFirst('FechaEmision'),
        tipoDespacho: findFirst('TipoDespacho'),
        formaPago: findFirst('FormaPago'),
        rutEmisor: findFirst('RutEmisor'),
        razonSocialEmisor: findFirst('RazonSocialEmisor'),
        giroEmisor: findFirst('GiroEmisor'),
        acteco: findFirst('Acteco'),
        codSII: findFirst('CodSIISucursal'),
        direccionEmisor: directionIdxs[0],
        comunaEmisor: comunaIdxs[0],
        ciudadEmisor: ciudadIdxs[0],
        rutReceptor: findFirst('RutReceptor'),
        razonSocialReceptor: findFirst('RazonSocialReceptor'),
        giroReceptor: findFirst('GiroReceptor'),
        direccionReceptor: directionIdxs[1],
        comunaReceptor: comunaIdxs[1],
        ciudadReceptor: ciudadIdxs[1],
        totalNeto: findFirst('Total-Neto'),
        totalExento: findFirst('Total-Exento'),
        totalIVA: findFirst('Total-IVA'),
        totalMonto: findFirst('Total-MontoTotal'),
        montoPeriodo: findFirst('MontoPeriodo'),
        montoNoFacturable: findFirst('Monto-NoFacturable'),
        saldoAnterior: findFirst('Saldo-Anterior'),
        valorPagar: findFirst('ValorPagar'),
    };

    if (idx.folio === -1 || idx.fechaEmision === -1 || idx.razonSocialReceptor === -1 || idx.razonSocialEmisor === -1) {
        throw new Error('Faltan columnas obligatorias del SII (Folio / FechaEmision / RazonSocial). ¿Es el Excel correcto?');
    }

    const result = [];
    let current = null;

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;

        const c0 = String(r[0] || '').trim();
        const c0Upper = c0.toUpperCase();

        // Skip: filas de sub-encabezado y re-encabezados
        if (c0 === '' && r.slice(1).every((c) => String(c || '').trim() === '')) continue;
        if (c0Upper === 'DETALLE' || c0Upper === 'TIPODTE') continue;

        // Fila de item: col0 vacío, col1 con número
        if (c0 === '' && String(r[1] || '').trim() !== '') {
            // Sólo capturamos el primer item por factura (el schema actual sólo guarda 1)
            if (current && !current.__hasItem && mode === 'emitidas') {
                current.detalle_descripcion = toText(r[4]);
                current.detalle_cantidad = parseNumber(r[5]);
                current.detalle_precio_clp = parseNumber(r[6]);
                current.detalle_monto_item_clp = parseNumber(r[10]);
                current.__hasItem = true;
            }
            continue;
        }

        // Fila main: TipoDTE numérico
        const tipoDTE = parseInt(c0, 10);
        if (Number.isNaN(tipoDTE)) continue;

        // Push anterior si existía
        if (current) {
            delete current.__hasItem;
            result.push(current);
        }

        const folio = toText(r[idx.folio]);
        const fechaEmision = parseDate(r[idx.fechaEmision]);
        if (!folio || !fechaEmision) {
            current = null;
            continue;
        }

        const totalMonto = parseNumber(r[idx.totalMonto]);

        if (mode === 'emitidas') {
            current = {
                tipo_dte: tipoDTE,
                tipo_documento: tipoDTE,
                folio,
                numero_folio: parseInt(folio, 10) || null,
                numero_factura: folio,
                fecha_emision: fechaEmision,
                tipo_despacho: toText(r[idx.tipoDespacho]),
                forma_pago: toText(r[idx.formaPago]),
                rut_emisor: toText(r[idx.rutEmisor]),
                razon_social_emisor: toText(r[idx.razonSocialEmisor]),
                giro_emisor: toText(r[idx.giroEmisor]),
                acteco_emisor: toText(r[idx.acteco]),
                codigo_sii_sucursal: toText(r[idx.codSII]),
                direccion_emisor: toText(r[idx.direccionEmisor]),
                comuna_emisor: toText(r[idx.comunaEmisor]),
                ciudad_emisor: toText(r[idx.ciudadEmisor]),
                rut_receptor: toText(r[idx.rutReceptor]),
                rut_cliente: toText(r[idx.rutReceptor]),
                razon_social_receptor: toText(r[idx.razonSocialReceptor]),
                cliente: toText(r[idx.razonSocialReceptor]),
                giro_receptor: toText(r[idx.giroReceptor]),
                direccion_receptor: toText(r[idx.direccionReceptor]),
                comuna_receptor: toText(r[idx.comunaReceptor]),
                ciudad_receptor: toText(r[idx.ciudadReceptor]),
                total_neto_clp: parseNumber(r[idx.totalNeto]),
                total_exento_clp: parseNumber(r[idx.totalExento]),
                total_iva_clp: parseNumber(r[idx.totalIVA]),
                total_monto_clp: totalMonto,
                monto_clp: totalMonto,
                monto_periodo_clp: parseNumber(r[idx.montoPeriodo]),
                monto_no_facturable_clp: parseNumber(r[idx.montoNoFacturable]),
                saldo_anterior_clp: parseNumber(r[idx.saldoAnterior]),
                valor_pagar_clp: parseNumber(r[idx.valorPagar]),
                origen: 'sii_xls',
                fuente: 'sii_xls',
                nombre_archivo_origen: fileName,
                periodo_anio: parseInt(fechaEmision.split('-')[0], 10),
                periodo_mes: parseInt(fechaEmision.split('-')[1], 10),
                __hasItem: false,
            };
        } else {
            // mode === 'recibidas' → schema más simple
            current = {
                numero_factura: folio,
                proveedor: toText(r[idx.razonSocialEmisor]),
                fecha_emision: fechaEmision,
                monto_clp: totalMonto,
                descripcion: toText(r[idx.giroEmisor]) || null,
                __hasItem: false,
            };
        }
    }
    if (current) {
        delete current.__hasItem;
        result.push(current);
    }
    return result;
}
