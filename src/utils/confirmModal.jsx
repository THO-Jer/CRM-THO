import { createRoot } from 'react-dom/client'

/**
 * Modal de confirmación estilizado (reemplaza window.confirm).
 *
 * API:
 *   const ok = await confirmModal('¿Eliminar X?')
 *   const ok = await confirmModal('¿Eliminar el prospecto de Acme?', {
 *       title: 'Eliminar prospecto',
 *       danger: true,
 *       confirmLabel: 'Eliminar',
 *       cancelLabel: 'Cancelar'
 *   })
 *
 * Promise-based: resuelve true si el usuario confirma, false si cancela o
 * cierra el modal (con la X, click en backdrop, o tecla Escape).
 *
 * Implementación: renderiza un portal imperativo. No requiere provider en
 * el árbol de la app, así que se puede llamar desde cualquier handler async
 * (incluyendo hooks como useCRMActions).
 */
function ConfirmDialog({ message, title, confirmLabel, cancelLabel, danger, onYes, onNo }) {
    const confirmClass = danger
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-naranja text-white hover:opacity-90'

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onNo}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="confirm-modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {title}
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-5 whitespace-pre-line">
                    {message}
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onNo}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onYes}
                        autoFocus
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${confirmClass}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

export function confirmModal(message, options = {}) {
    const {
        title = 'Confirmar',
        confirmLabel = 'Confirmar',
        cancelLabel = 'Cancelar',
        danger = false,
    } = options

    return new Promise((resolve) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        const cleanup = () => {
            document.removeEventListener('keydown', handleKey)
            // setTimeout 0 evita warning de unmount durante render
            setTimeout(() => {
                root.unmount()
                container.remove()
            }, 0)
        }

        const handleYes = () => { cleanup(); resolve(true) }
        const handleNo = () => { cleanup(); resolve(false) }

        const handleKey = (e) => {
            if (e.key === 'Escape') handleNo()
            if (e.key === 'Enter') handleYes()
        }
        document.addEventListener('keydown', handleKey)

        root.render(
            <ConfirmDialog
                message={message}
                title={title}
                confirmLabel={confirmLabel}
                cancelLabel={cancelLabel}
                danger={danger}
                onYes={handleYes}
                onNo={handleNo}
            />
        )
    })
}
