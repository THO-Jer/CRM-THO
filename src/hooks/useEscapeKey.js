import { useEffect } from 'react'

/**
 * Cierra un modal con la tecla Escape.
 * Antes los modales sólo cerraban con click en backdrop o X — molesto para
 * usuarios de teclado y rompía la expectativa estándar.
 *
 * Uso:
 *   useEscapeKey(onClose, isOpen)
 *
 * Si isOpen se omite, el listener siempre está activo (útil para componentes
 * que se montan sólo cuando el modal está abierto).
 */
export default function useEscapeKey(onClose, isOpen = true) {
    useEffect(() => {
        if (!isOpen || typeof onClose !== 'function') return;
        const handler = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose, isOpen]);
}
