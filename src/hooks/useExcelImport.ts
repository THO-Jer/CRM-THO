import { useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { showToast } from '../utils/toast'
import {
    readWorkbook,
    parseBoletasHonorarios,
    parseFacturasEmitidas,
    parseFacturasRecibidas,
} from '../utils/excelParsers'

type User = { email?: string } | null

interface UseExcelImportParams {
    user: User
    ufActual: number
    loadBoletasHonorarios: () => Promise<void>
    loadFacturasEmitidas: () => Promise<void>
    loadFacturasRecibidas: () => Promise<void>
}

interface InsertResult {
    insertadas: number
    duplicadas: number
    errores: number
    errorMsg?: string
}

export default function useExcelImport({
    user, ufActual,
    loadBoletasHonorarios, loadFacturasEmitidas, loadFacturasRecibidas,
}: UseExcelImportParams) {
    const pickFile = useCallback((accept: string): Promise<File | null> => {
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
            const onFocus = () => {
                setTimeout(() => {
                    if (!input.files || input.files.length === 0) {
                        cleanup(); resolve(null)
                    }
                }, 300)
            }
            input.addEventListener('change', () => {
                const file = input.files && input.files[0]
                cleanup(); resolve(file || null)
            })
            window.addEventListener('focus', onFocus)
            input.click()
        })
    }, [])

    const insertWithDedup = useCallback(async (
        table: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dedupKey: (row: any) => string
    ): Promise<InsertResult> => {
        if (!rows.length) return { insertadas: 0, duplicadas: 0, errores: 0 }

        const { data: existing, error: selErr } = await supabase.from(table).select('*')
        if (selErr) {
            console.error('[useExcelImport] select existentes', selErr)
            return { insertadas: 0, duplicadas: 0, errores: rows.length, errorMsg: selErr.message }
        }
        const existingKeys = new Set((existing || []).map(dedupKey))

        const toInsert = []
        let duplicadas = 0
        for (const r of rows) {
            if (existingKeys.has(dedupKey(r))) duplicadas++
            else toInsert.push(r)
        }

        if (!toInsert.length) return { insertadas: 0, duplicadas, errores: 0 }

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dedupKey = (b: any) => `${b.rut_prestador || b.rut || ''}|${b.fecha || ''}|${b.monto_bruto_clp || 0}`
            const r = await insertWithDedup('boletas_honorarios', rows, dedupKey)
            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadBoletasHonorarios()
            showToast(`Boletas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarBoletasExcel]', err)
            showToast(`Error al importar boletas: ${(err as Error).message}`, 'error')
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dedupKey = (f: any) => `${f.rut_emisor || ''}|${f.folio || f.numero_factura || ''}|${f.tipo_dte || ''}`
            const r = await insertWithDedup('facturas_emitidas', rows, dedupKey)
            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadFacturasEmitidas()
            showToast(`Facturas emitidas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarFacturasEmitidasExcel]', err)
            showToast(`Error al importar facturas emitidas: ${(err as Error).message}`, 'error')
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dedupKey = (f: any) => `${(f.proveedor || '').toLowerCase()}|${f.numero_factura || ''}|${f.fecha_emision || ''}`
            const r = await insertWithDedup('facturas_recibidas', rows, dedupKey)
            if (r.errorMsg) { showToast(`Error: ${r.errorMsg}`, 'error'); return }
            await loadFacturasRecibidas()
            showToast(`Facturas recibidas: ${r.insertadas} importadas, ${r.duplicadas} duplicadas`, 'success')
        } catch (err) {
            console.error('[importarFacturasRecibidasExcel]', err)
            showToast(`Error al importar facturas recibidas: ${(err as Error).message}`, 'error')
        }
    }, [user, ufActual, pickFile, insertWithDedup, loadFacturasRecibidas])

    return { importarBoletasExcel, importarFacturasEmitidasExcel, importarFacturasRecibidasExcel }
}
