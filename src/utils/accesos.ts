import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// ACCESOS AL CRM — quién entra y con qué rol (tabla public.crm_members).
// Las reglas de verdad las impone la base (RLS + trigger, ver sql/accesos-crm.sql);
// lo de acá sólo sirve para mostrar/ocultar controles en la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

export type RolCRM = 'superadmin' | 'admin' | 'usuario'

export const ROL_LABEL: Record<RolCRM, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    usuario: 'Usuario',
}

export const ROL_DESCRIPCION: Record<RolCRM, string> = {
    superadmin: 'Todo el CRM y administra a cualquier persona, incluidos admins.',
    admin: 'Todo el CRM y administra a los usuarios.',
    usuario: 'Ve y edita todo el CRM. No administra accesos.',
}

export interface MiembroCRM {
    email: string
    nombre: string | null
    rol: RolCRM
    activo: boolean
    created_at: string | null
    updated_at: string | null
    updated_by: string | null
}

export interface CuentaLogin {
    email: string
    proveedor: string | null
    creada: string | null
    ultimo_ingreso: string | null
}

export interface RegistroAcceso {
    id: number
    fecha: string
    actor: string | null
    accion: 'INSERT' | 'UPDATE' | 'DELETE'
    email: string
    antes: Partial<MiembroCRM> | null
    despues: Partial<MiembroCRM> | null
}

/**
 * - 'cargando': todavía no sabemos
 * - 'activo': puede usar el CRM (rol definido)
 * - 'inactivo': tiene fila pero está desactivado
 * - 'sin_acceso': no tiene fila en crm_members
 * - 'desconocido': la consulta falló (red, o migración no corrida): no bloqueamos
 */
export type EstadoAcceso = 'cargando' | 'activo' | 'inactivo' | 'sin_acceso' | 'desconocido'

export interface MiAcceso {
    estado: EstadoAcceso
    rol: RolCRM | null
}

export async function cargarMiAcceso(email: string): Promise<MiAcceso> {
    const { data, error } = await supabase
        .from('crm_members')
        .select('rol, activo')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()
    if (error) {
        console.warn('[accesos] no se pudo leer crm_members:', error.message)
        return { estado: 'desconocido', rol: null }
    }
    if (!data) return { estado: 'sin_acceso', rol: null }
    const rol = (data as { rol: RolCRM }).rol
    return (data as { activo: boolean }).activo ? { estado: 'activo', rol } : { estado: 'inactivo', rol }
}

export const esAdminCRM = (rol: RolCRM | null | undefined) => rol === 'superadmin' || rol === 'admin'

/** Roles que `miRol` puede asignar a otra persona. */
export function rolesAsignables(miRol: RolCRM | null): RolCRM[] {
    if (miRol === 'superadmin') return ['superadmin', 'admin', 'usuario']
    if (miRol === 'admin') return ['usuario']
    return []
}

/** ¿Puede `miRol` cambiar rol/estado o eliminar a `m`? (sobre sí mismo nunca) */
export function puedeAdministrar(miEmail: string, miRol: RolCRM | null, m: MiembroCRM): boolean {
    if (m.email === miEmail.toLowerCase()) return false
    if (miRol === 'superadmin') return true
    if (miRol === 'admin') return m.rol === 'usuario'
    return false
}

// ── Endpoint /api/admin/usuarios (Vercel, usa service role) ─────────────────

async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Cuentas de inicio de sesión (Supabase Auth). null si el endpoint no está disponible. */
export async function cargarCuentasLogin(): Promise<CuentaLogin[] | null> {
    try {
        const res = await fetch('/api/admin/usuarios', { headers: await authHeaders() })
        if (!res.ok) return null
        const json = await res.json()
        return Array.isArray(json?.cuentas) ? json.cuentas as CuentaLogin[] : null
    } catch {
        return null
    }
}

/** Borra la cuenta de inicio de sesión (y su acceso al CRM si lo tiene). Sólo superadmin. */
export async function borrarCuentaLogin(email: string): Promise<{ ok: boolean; mensaje: string }> {
    try {
        const res = await fetch('/api/admin/usuarios', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ email }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, mensaje: json?.error || `Error ${res.status}` }
        return { ok: true, mensaje: json?.mensaje || 'Cuenta eliminada.' }
    } catch (e) {
        return { ok: false, mensaje: e instanceof Error ? e.message : 'Error de red' }
    }
}

/** Traduce errores de Postgres/RLS a algo legible. */
export function mensajeError(err: { message?: string; code?: string } | null | undefined): string {
    if (!err) return 'Error desconocido'
    if (err.code === '23505') return 'Ese email ya tiene un acceso registrado.'
    if (err.code === '23514') return 'Email o rol inválido.'
    if (err.code === '42501' || /row-level security/i.test(err.message || '')) return 'No tienes permiso para hacer ese cambio.'
    return err.message || 'Error desconocido'
}
