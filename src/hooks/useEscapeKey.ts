import { useEffect } from 'react'

/**
 * Cierra un modal con la tecla Escape.
 * Uso: useEscapeKey(onClose, isOpen)
 * Si isOpen se omite, el listener siempre está activo.
 */
export default function useEscapeKey(onClose: () => void, isOpen = true): void {
    useEffect(() => {
        if (!isOpen || typeof onClose !== 'function') return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose, isOpen])
}
