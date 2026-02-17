import { useState, useEffect, useRef } from 'react'
import { showToast } from '../../utils/toast'

export default function LoginModal({ onLogin, onClose }) {
    const [email, setEmail] = useState('');
    const inputRef = useRef(null);
    
    useEffect(() => {
        inputRef.current?.focus();
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const validEmails = ['jeremias@tho.cl', 'max@tho.cl', 'francisco@tho.cl'];
        if (validEmails.includes(email.toLowerCase())) {
            onLogin(email);
        } else {
            showToast('Email no autorizado. Contacta al administrador.', 'info');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-naranja mb-2">CRM THO</h2>
                    <p className="text-sm text-gray-600">Ingresa tu email para continuar</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            ref={inputRef}
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tu-email@tho.cl"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-naranja focus:border-transparent transition-shadow"
                        />
                    </div>
                    <button type="submit" className="w-full px-4 py-3 color-naranja text-white rounded-lg font-medium hover:bg-orange-600 transition-colors">
                        Ingresar
                    </button>
                    <button type="button" onClick={onClose} className="w-full px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors">
                        Ver como invitado
                    </button>
                </form>
                <p className="text-xs text-gray-500 text-center mt-4">
                    Solo usuarios autorizados pueden editar datos
                </p>
            </div>
        </div>
    );
}
