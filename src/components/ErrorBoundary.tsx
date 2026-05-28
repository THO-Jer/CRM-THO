import { Component, ReactNode, ErrorInfo } from 'react'

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

interface ErrorBoundaryProps {
    children: ReactNode
}

/**
 * ErrorBoundary — captura errores de render de React.
 *
 * Sin esto, un error en cualquier componente hijo (como el TDZ que tuvimos al
 * referenciar setShowModal antes de su useState) deja el DOM blanco sin pista
 * para el usuario. Con esto, mostramos un mensaje claro + el detalle del error
 * + un botón para recargar.
 *
 * Nota: ErrorBoundary debe ser un class component — React no soporta hooks
 * para esto. Los errores en eventos asíncronos (handlers de promesas) se
 * siguen capturando vía el window.addEventListener('error') / unhandledrejection
 * que ya tiene App.tsx.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
        this.handleReload = this.handleReload.bind(this)
        this.handleReset = this.handleReset.bind(this)
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        // Activa el render del fallback en el siguiente ciclo.
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Loggeamos al mismo channel que el window.error handler de App.tsx.
        console.error('[CRM ErrorBoundary]', error, errorInfo)
        this.setState({ errorInfo })
    }

    handleReload() {
        window.location.reload()
    }

    handleReset() {
        this.setState({ hasError: false, error: null, errorInfo: null })
    }

    render() {
        if (!this.state.hasError) return this.props.children

        const errorMessage = this.state.error?.message || 'Error desconocido'
        const errorStack = this.state.error?.stack || ''
        const componentStack = this.state.errorInfo?.componentStack || ''

        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
                <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <div className="flex items-start gap-3 mb-4">
                        <span className="text-3xl" aria-hidden>⚠️</span>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                Algo se rompió en el CRM
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                No te preocupes — tus datos están a salvo en Supabase. Esto sólo afecta lo que se muestra en pantalla ahora mismo.
                            </p>
                        </div>
                    </div>

                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg p-3 mb-4">
                        <p className="text-sm font-mono text-red-700 dark:text-red-300 break-words">
                            {errorMessage}
                        </p>
                    </div>

                    <details className="mb-4">
                        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                            Detalle técnico (útil si necesitas reportar el bug)
                        </summary>
                        <pre className="mt-2 text-[10px] text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
{errorStack}
{componentStack ? `\nComponent stack:${componentStack}` : ''}
                        </pre>
                    </details>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="px-4 py-2 bg-naranja text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
                        >
                            Recargar página
                        </button>
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                        >
                            Intentar continuar
                        </button>
                    </div>
                </div>
            </div>
        )
    }
}
