import { useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import {
    readWorkbook,
    parseBoletasHonorarios,
    parseFacturasEmitidas,
    parseFacturasRecibidas,
} from '../utils/excelParsers'

/**
 * Hook para importar Excels del SII y volcarlos a las tablas correspondientes:
 *  - Boletas de honorarios   → tabla boletas_honorarios
 *  - Facturas emitidas        → tabla facturas_emitidas
 *  - Facturas recibidas       → tabla facturas_recibidas
 *
 * Cada función abre un file picker, parsea, deduplica contra lo ya existente
 * en Supabase, hace bulk insert, refresca la lista, y muestra un toast con
 * el resumen (X importadas, Y duplicadas, Z errores).
 *
 * Reemplaza al antiguo useSII.jsx que combinaba sync por API (ya no funciona
 * porque el SII cambió su seguridad) con import por Excel.
 */
export default function useExcelImport({
    user,
    ufActual,
    loadBoletasHonorarios,
    loadFacturasEmitidas,
    loadFacturasRecibidas,
}) {
    /**
     * Abre un input file oculto y devuelve el File elegido por el usuario,
     * o null si canceló.
     */
    const pickFile = useCallback((accept) => {
        return new Promise((resolve) => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = accept
            input.style.display = 'none'
            document.body.appendChild(input)
            const cleanup = () => {
                input.remove()
                window.removeEventListener('focus', onFocus)
            }
            // Si el usuario cancela el diálogo nativo, el "change" no dispara;
            // detectamos el cancel por el "focus" de la ventana sin un file.
            const onFocus = () => {
                setTimeout(() => {
                    if (!input.files || input.files.length === 0) {
                        cleanup()
                        resolve(null)
                    }
                }, 300)
            }
            input.addEventListener('change', () => {
                const file = input.files && input.files[0]
                cleanup()
                resolve(file || null)
            })
            window.addEventListener('focus', onFocus)
            input.click()
        })
    }, [])

    /**
     * Inserta filas en bulk con dedup. `dedupKey` es función (row) → string
     * que arma una llave de comparación. Devuelve {insertadas, duplicadas, errores}.
     */
    const insertWithDedup = useCallback(async (table, rows, dedupKey) => {
        if (!rows.length) return { insertadas: 0, duplicadas: 0, errores: 0 }

        // 1) Traer todas las filas existentes para comparar claves.
        const { data: existing, error: selErr } = await supabase.from(table).select('*')
        if (selErr) {
            console.error('[useExcelImport] select existentes', selErr)
            return { insertadas: 0, duplicadas: 0, errores: rows.length, errorMsg: selErr.message }
        }
        const existingKeys = new Set((existing || []).map(dedupKey))

        // 2) Filtrar duplicados.
        const toInsert = []
        let duplicadas = 0
        for (const r of rows) {
            if (existingKeys.has(dedupKey(r))) {
                duplicadas++
            } else {
                toInsert.push(r)
            }
        }

        if (!toInsert.length) return { insertadas: 0, duplicadas, errores: 0 }

        // 3) Insert.
        const { error: insErr } = await supabase.from(table).insert(toInsert)
        if (insErr) {
            console.error('[useExcelImport] insert error', insErr)
            return { insertadas: 0, duplicadas, errores: toInsert.length, errorMsg: insErr.message }
        }
        return { insertadas: toInsert.length, duplicadas, errores: 0 }
    }, [])

    const importarBoletasExcel = useCallback(async () => {
        if (!user) { showToast('Inicia sesión primero', 'warning'); return }
        const file = await pickFile('.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        if (!file) return
        try {
            const workbook = await readWorkbook(file)
            const rows = parseBoletasHonorarios(workbook, { ufActual, fileName: file.name })
            if (!rows.length) { showToast('No se encontraron boletas en el archivo', 'warning'); return }

            // Dedup por (rut_prestador + fecha + monto_bruto_clp) — misma lógica que tenía useSII viejo.
            const dedupKey = (b) => `${b.rut_prestador || b.rut || ''}|${b.fecha || ''}|${b.monto_bruto_clp || 0}`
            const r = await insertWithDedup('boletas_honorarios', rows, dedupKey)

            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadBoletasHonorarios()
            showToast(`📄 Boletas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarBoletasExcel]', err)
            showToast(`Error al importar boletas: ${err.message}`, 'error')
        }
    }, [user, ufActual, pickFile, insertWithDedup, loadBoletasHonorarios])

    const importarFacturasEmitidasExcel = useCallback(async () => {
        if (!user) { showToast('Inicia sesión primero', 'warning'); return }
        const file = await pickFile('.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        if (!file) return
        try {
            const workbook = await readWorkbook(file)
            const rows = parseFacturasEmitidas(workbook, { fileName: file.name, ufActual })
            if (!rows.length) { showToast('No se encontraron facturas emitidas en el archivo', 'warning'); return }

            // Dedup por (rut_emisor + folio + tipo_dte) — única por documento tributario.
            const dedupKey = (f) => `${f.rut_emisor || ''}|${f.folio || f.numero_factura || ''}|${f.tipo_dte || ''}`
            const r = await insertWithDedup('facturas_emitidas', rows, dedupKey)

            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadFacturasEmitidas()
            showToast(`📄 Facturas emitidas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarFacturasEmitidasExcel]', err)
            showToast(`Error al importar facturas emitidas: ${err.message}`, 'error')
        }
    }, [user, ufActual, pickFile, insertWithDedup, loadFacturasEmitidas])

    const importarFacturasRecibidasExcel = useCallback(async () => {
        if (!user) { showToast('Inicia sesión primero', 'warning'); return }
        const file = await pickFile('.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        if (!file) return
        try {
            const workbook = await readWorkbook(file)
            const rows = parseFacturasRecibidas(workbook, { fileName: file.name, ufActual })
            if (!rows.length) { showToast('No se encontraron facturas recibidas en el archivo', 'warning'); return }

            // Dedup por (proveedor + numero_factura + fecha_emision) — únicas por proveedor.
            const dedupKey = (f) => `${(f.proveedor || '').toLowerCase()}|${f.numero_factura || ''}|${f.fecha_emision || ''}`
            const r = await insertWithDedup('facturas_recibidas', rows, dedupKey)

            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadFacturasRecibidas()
            showToast(`📄 Facturas recibidas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarFacturasRecibidasExcel]', err)
            showToast(`Error al importar facturas recibidas: ${err.message}`, 'error')
        }
    }, [user, ufActual, pickFile, insertWithDedup, loadFacturasRecibidas])

    return {
        importarBoletasExcel,
        importarFacturasEmitidasExcel,
        importarFacturasRecibidasExcel,
    }
}
