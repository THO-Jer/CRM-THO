import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'

export default function LoginModal({ onLogin, onClose }) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [showEmail, setShowEmail] = useState(false);
    const inputRef = useRef(null);
    
    useEffect(() => {
        if (showEmail) inputRef.current?.focus();
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose, showEmail]);

    const handleMicrosoftLogin = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    scopes: 'email profile openid',
                    redirectTo: window.location.origin,
                }
            });
            if (error) {
                console.warn('OAuth error:', error);
                showToast('OAuth no configurado aún. Usa email para ingresar.', 'warning');
                setShowEmail(true);
            }
        } catch (e) {
            console.warn('OAuth exception:', e);
            showToast('OAuth no disponible. Usa email para ingresar.', 'warning');
            setShowEmail(true);
        } finally {
            setLoading(false);
        }
    };

    const handleEmailSubmit = (e) => {
        e.preventDefault();
        const validEmails = ['jeremias@tho.cl', 'max@tho.cl', 'francisco@tho.cl'];
        if (validEmails.includes(email.toLowerCase())) {
            onLogin(email);
        } else {
            showToast('Email no autorizado. Contacta al administrador.', 'info');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
                <div className="text-center mb-8">
                    <img src="/logo-tho.png" alt="THO" className="h-12 mx-auto mb-4 dark:brightness-0 dark:invert" />
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Bienvenido al CRM</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Inicia sesión para continuar</p>
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

                    <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">o</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    {showEmail ? (
                        <form onSubmit={handleEmailSubmit} className="space-y-3">
                            <input
                                ref={inputRef}
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tu-email@tho.cl"
                                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-naranja focus:border-transparent"
                            />
                            <button type="submit" className="w-full px-4 py-3 color-naranja text-white rounded-xl font-medium text-sm">
                                Ingresar con email
                            </button>
                        </form>
                    ) : (
                        <button 
                            onClick={() => setShowEmail(true)} 
                            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                        >
                            Ingresar con email
                        </button>
                    )}

                    <button 
                        onClick={onClose} 
                        className="w-full px-4 py-2 text-gray-400 dark:text-gray-500 text-xs hover:text-gray-600 transition"
                    >
                        Continuar como invitado
                    </button>
                </div>

                <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-6">
                    Solo usuarios autorizados pueden editar datos
                </p>
            </div>
        </div>
    );
}
