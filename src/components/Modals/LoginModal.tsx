import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'

interface LoginModalProps {
    onClose: () => void
}

// El flujo de "email login" anterior se eliminó al cerrar las RLS de Supabase:
// guardaba el email en localStorage pero no creaba sesión real, así que tras la
// migración el usuario quedaba "logeado" en UI sin poder leer ni escribir.
// La autenticación ahora es exclusivamente Microsoft OAuth (Supabase Auth).
export default function LoginModal({ onClose }: LoginModalProps) {
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    const handleMicrosoftLogin = async () => {
        setLoading(true)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    scopes: 'email profile openid',
                    redirectTo: window.location.origin,
                }
            })
            if (error) {
                console.warn('OAuth error:', error)
                showToast(`No se pudo iniciar sesión con Microsoft: ${error.message}`, 'error')
            }
        } catch (e) {
            console.warn('OAuth exception:', e)
            showToast(`Error de conexión: ${(e as Error)?.message || 'no se pudo contactar a Supabase'}`, 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
                <div className="text-center mb-8">
                    <img src="/logo-tho.png" alt="THO" className="h-12 mx-auto mb-4 dark:brightness-0 dark:invert" />
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Bienvenido al CRM</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Inicia sesión con tu cuenta de THO</p>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={handleMicrosoftLogin}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#2F2F2F] hover:bg-[#3b3b3b] text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                        <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                            <rect width="10" height="10" fill="#F25022"/>
                            <rect x="11" width="10" height="10" fill="#7FBA00"/>
                            <rect y="11" width="10" height="10" fill="#00A4EF"/>
                            <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                        </svg>
                        {loading ? 'Conectando...' : 'Iniciar con Microsoft 365'}
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-gray-400 dark:text-gray-500 text-xs hover:text-gray-600 transition mt-3"
                        title="Cierra el modal sin iniciar sesión"
                    >
                        Cerrar
                    </button>
                </div>

                <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-6">
                    Acceso restringido a socios de THO
                </p>
            </div>
        </div>
    )
}
