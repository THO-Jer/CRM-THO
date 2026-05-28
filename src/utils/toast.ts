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

    const icons: Record<ToastType, string> = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`

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
