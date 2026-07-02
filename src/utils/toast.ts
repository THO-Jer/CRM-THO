type ToastType = 'success' | 'error' | 'warning' | 'info'

export function showToast(message: string, type: ToastType = 'info'): void {
    let container = document.getElementById('toast-container')
    if (!container) {
        container = document.createElement('div')
        container.id = 'toast-container'
        container.className = 'toast-container'
        document.body.appendChild(container)
    }

    const toast = document.createElement('div')
    toast.className = `toast ${type}`

    // Íconos SVG inline (lucide) — el toast se crea fuera de React, así que no
    // podemos usar componentes; los paths son los de check-circle/x-circle/alert-triangle/info.
    const iconPaths: Record<ToastType, { path: string; color: string }> = {
        success: { path: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', color: 'var(--verde)' },
        error: { path: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', color: 'var(--rojo)' },
        warning: { path: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', color: '#F59E0B' },
        info: { path: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', color: 'var(--azul)' },
    }
    const icon = iconPaths[type]
    toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${icon.path}</svg><span>${message}</span>`

    container.appendChild(toast)

    setTimeout(() => {
        toast.style.opacity = '0'
        toast.style.transform = 'translateX(400px)'
        toast.style.transition = 'all 0.3s ease'
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

// confirmModal se movió a './confirmModal.tsx' como un modal estilizado.
// Para usarlo: import { confirmModal } from './confirmModal'
