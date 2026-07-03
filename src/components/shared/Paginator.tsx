import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Paginación en el cliente para listas/tablas largas.
 *
 * Uso:
 *   const pag = usePaged(boletasAct)          // 25 por página por defecto
 *   ...
 *   {pag.items.map(...)}                       // en vez de boletasAct.map(...)
 *   <Paginator {...pag.controls} />            // controles bajo la tabla
 *
 * El hook clampa la página si la lista se achica (ej: cambia un filtro de
 * fechas) para no quedar mirando una página vacía.
 */

export interface PaginatorControls {
    page: number
    setPage: (p: number) => void
    pageSize: number
    setPageSize: (n: number) => void
    total: number
}

const PAGE_SIZES = [25, 50, 100, 250]

export function usePaged<T>(items: T[], defaultPageSize = 25): { items: T[]; controls: PaginatorControls } {
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(defaultPageSize)
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
    const safePage = Math.min(page, totalPages - 1)
    const slice = useMemo(
        () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
        [items, safePage, pageSize]
    )
    return { items: slice, controls: { page: safePage, setPage, pageSize, setPageSize, total } }
}

export default function Paginator({ page, setPage, pageSize, setPageSize, total }: PaginatorControls) {
    // Con pocos ítems no hay nada que paginar — no ensuciar la UI
    if (total <= PAGE_SIZES[0]) return null

    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const desde = page * pageSize + 1
    const hasta = Math.min((page + 1) * pageSize, total)

    return (
        <div className="flex items-center justify-between gap-3 pt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            <span className="tnum">{desde}–{hasta} de {total}</span>
            <div className="flex items-center gap-2">
                <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
                    className="px-2 py-1 text-xs border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-200"
                    aria-label="Filas por página"
                >
                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
                </select>
                <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border dark:border-gray-600 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    aria-label="Página anterior"
                    style={{ minHeight: 0 }}
                >
                    <ChevronLeft size={14} />
                </button>
                <span className="tnum whitespace-nowrap">{page + 1} / {totalPages}</span>
                <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg border dark:border-gray-600 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    aria-label="Página siguiente"
                    style={{ minHeight: 0 }}
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    )
}
