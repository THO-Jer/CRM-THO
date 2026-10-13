import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck, UserPlus, Trash2, Power, RefreshCw, Info, Database, History, KeyRound } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { showToast } from '../../utils/toast'
import { confirmModal } from '../../utils/confirmModal'
import { formatDateTime } from '../../utils/formatters'
import {
    ROL_LABEL, ROL_DESCRIPCION, rolesAsignables, puedeAdministrar, mensajeError,
    cargarCuentasLogin, borrarCuentaLogin,
    type RolCRM, type MiembroCRM, type CuentaLogin, type RegistroAcceso,
} from '../../utils/accesos'

// ─────────────────────────────────────────────────────────────────────────────
// ACCESOS — quién puede entrar al CRM y con qué rol.
// Visible sólo para superadmin/admin. Las reglas reales las impone Supabase
// (RLS + trigger en sql/accesos-crm.sql); esta pantalla sólo oculta lo que no
// corresponde para no mostrar botones que igual fallarían.
// ─────────────────────────────────────────────────────────────────────────────

const ROL_BADGE: Record<RolCRM, string> = {
    superadmin: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    admin: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    usuario: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}
const ORDEN_ROL: Record<RolCRM, number> = { superadmin: 0, admin: 1, usuario: 2 }

interface Props {
    miEmail: string
    miRol: RolCRM
}

export default function AccesosView({ miEmail, miRol }: Props) {
    const yo = miEmail.toLowerCase()
    const [miembros, setMiembros] = useState<MiembroCRM[]>([])
    const [cuentas, setCuentas] = useState<CuentaLogin[] | null>(null)
    const [registro, setRegistro] = useState<RegistroAcceso[]>([])
    const [loading, setLoading] = useState(true)
    const [faltaMigracion, setFaltaMigracion] = useState(false)
    const [ocupado, setOcupado] = useState<string | null>(null)
    const [form, setForm] = useState<{ email: string; nombre: string; rol: RolCRM }>({ email: '', nombre: '', rol: 'usuario' })
    const [nombres, setNombres] = useState<Record<string, string>>({})

    const asignables = rolesAsignables(miRol)

    const cargar = useCallback(async () => {
        setLoading(true)
        const [m, log, ctas] = await Promise.all([
            supabase.from('crm_members').select('email, nombre, rol, activo, created_at, updated_at, updated_by'),
            supabase.from('crm_members_log').select('*').order('fecha', { ascending: false }).limit(20),
            cargarCuentasLogin(),
        ])
        if (m.error) {
            if (/column .*(rol|activo)|does not exist|schema cache/i.test(m.error.message)) setFaltaMigracion(true)
            else showToast(`No se pudieron cargar los accesos: ${mensajeError(m.error)}`, 'error')
        } else {
            setFaltaMigracion(false)
            const lista = (m.data as MiembroCRM[]).sort((a, b) =>
                Number(b.activo) - Number(a.activo) || ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol] || a.email.localeCompare(b.email))
            setMiembros(lista)
            setNombres(Object.fromEntries(lista.map(x => [x.email, x.nombre || ''])))
        }
        if (!log.error) setRegistro(log.data as RegistroAcceso[])
        setCuentas(ctas)
        setLoading(false)
    }, [])

    useEffect(() => { void cargar() }, [cargar])

    const cuentaPorEmail = useMemo(() => new Map((cuentas || []).map(c => [c.email, c])), [cuentas])
    const emailsMiembros = useMemo(() => new Set(miembros.map(m => m.email)), [miembros])
    const otrasCuentas = useMemo(() => (cuentas || []).filter(c => !emailsMiembros.has(c.email))
        .sort((a, b) => (b.ultimo_ingreso || '').localeCompare(a.ultimo_ingreso || '')), [cuentas, emailsMiembros])

    // ── Acciones ────────────────────────────────────────────────────────────
    const actualizar = async (m: MiembroCRM, cambios: Partial<MiembroCRM>, okMsg: string) => {
        setOcupado(m.email)
        const { error } = await supabase.from('crm_members').update(cambios).eq('email', m.email)
        setOcupado(null)
        if (error) { showToast(mensajeError(error), 'error'); return }
        showToast(okMsg, 'success')
        void cargar()
    }

    const agregar = async (e: React.FormEvent) => {
        e.preventDefault()
        const email = form.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Escribe un email válido.', 'warning'); return }
        if (!email.endsWith('@tho.cl')) {
            const ok = await confirmModal(
                `${email} no es una cuenta @tho.cl. El CRM sólo permite entrar con Microsoft de THO, así que esta persona no podrá ingresar a menos que tenga cuenta (o invitación) en ese Microsoft. ¿Agregarla igual?`,
                { title: 'Cuenta externa', confirmLabel: 'Agregar igual' })
            if (!ok) return
        }
        setOcupado('__form')
        const { error } = await supabase.from('crm_members').insert({ email, nombre: form.nombre.trim() || null, rol: form.rol, activo: true })
        setOcupado(null)
        if (error) { showToast(mensajeError(error), 'error'); return }
        showToast(`${email} ya puede entrar al CRM como ${ROL_LABEL[form.rol]}.`, 'success')
        setForm({ email: '', nombre: '', rol: 'usuario' })
        void cargar()
    }

    const cambiarRol = async (m: MiembroCRM, rol: RolCRM) => {
        if (rol === m.rol) return
        if (rol === 'superadmin') {
            const ok = await confirmModal(`${m.email} tendrá el mismo control que tú, incluido administrar admins y borrar cuentas.`, { title: 'Dar rol de superadmin', confirmLabel: 'Sí, hacerlo superadmin' })
            if (!ok) return
        }
        await actualizar(m, { rol }, `${m.email} ahora es ${ROL_LABEL[rol]}.`)
    }

    const toggleActivo = async (m: MiembroCRM) => {
        if (m.activo) {
            const ok = await confirmModal(`${m.email} dejará de ver el CRM de inmediato (su cuenta y su historial se mantienen; puedes reactivarlo cuando quieras).`, { title: 'Desactivar acceso', danger: true, confirmLabel: 'Desactivar' })
            if (!ok) return
        }
        await actualizar(m, { activo: !m.activo }, m.activo ? `Acceso de ${m.email} desactivado.` : `Acceso de ${m.email} reactivado.`)
    }

    const guardarNombre = async (m: MiembroCRM) => {
        const nuevo = (nombres[m.email] || '').trim()
        if (nuevo === (m.nombre || '')) return
        await actualizar(m, { nombre: nuevo || null }, 'Nombre actualizado.')
    }

    const eliminar = async (m: MiembroCRM) => {
        const ok = await confirmModal(`${m.email} pierde el acceso al CRM. Lo que haya registrado en el CRM se mantiene.`, { title: 'Quitar del CRM', danger: true, confirmLabel: 'Quitar acceso' })
        if (!ok) return
        const tieneCuenta = cuentaPorEmail.has(m.email)
        if (miRol === 'superadmin' && tieneCuenta) {
            const borrarTambien = await confirmModal(
                `¿Borrar también su cuenta de inicio de sesión? Además de sacarlo del CRM, deja de poder entrar a Studio (tho.cl). No se puede deshacer. Si eliges "Sólo el CRM", la cuenta queda pero sin acceso al CRM.`,
                { title: 'Borrar cuenta de inicio de sesión', danger: true, confirmLabel: 'Borrar cuenta', cancelLabel: 'Sólo el CRM' })
            if (borrarTambien) {
                setOcupado(m.email)
                const r = await borrarCuentaLogin(m.email)
                setOcupado(null)
                showToast(r.mensaje, r.ok ? 'success' : 'error')
                void cargar()
                return
            }
        }
        setOcupado(m.email)
        const { error } = await supabase.from('crm_members').delete().eq('email', m.email)
        setOcupado(null)
        if (error) { showToast(mensajeError(error), 'error'); return }
        showToast(`${m.email} ya no tiene acceso al CRM.`, 'success')
        void cargar()
    }

    const borrarCuentaExterna = async (c: CuentaLogin) => {
        const ok = await confirmModal(
            `Se borra la cuenta de inicio de sesión de ${c.email}. No tiene acceso al CRM, pero puede estar usándola para Studio (tho.cl): también lo pierde. No se puede deshacer.`,
            { title: 'Borrar cuenta', danger: true, confirmLabel: 'Borrar cuenta' })
        if (!ok) return
        setOcupado(c.email)
        const r = await borrarCuentaLogin(c.email)
        setOcupado(null)
        showToast(r.mensaje, r.ok ? 'success' : 'error')
        void cargar()
    }

    // ── Render ──────────────────────────────────────────────────────────────
    if (faltaMigracion) return (
        <div className="max-w-xl mx-auto mt-10 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-6 text-center">
            <Database className="mx-auto text-naranja mb-3" size={28} />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Falta preparar la tabla de accesos</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">Corre una vez <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">sql/accesos-crm.sql</code> en Supabase → SQL Editor, y luego recarga.</p>
            <button onClick={() => void cargar()} className="mt-4 px-4 py-2 rounded-lg color-naranja text-white text-sm">Reintentar</button>
        </div>
    )

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Explicación */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 md:p-5">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="text-naranja flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                        <p>Aquí decides quién puede usar el CRM. Desactivar corta el acceso al instante sin borrar nada; quitar elimina el acceso.</p>
                        <ul className="grid md:grid-cols-3 gap-2">
                            {(['superadmin', 'admin', 'usuario'] as RolCRM[]).map(r => (
                                <li key={r} className="flex flex-col gap-1">
                                    <span className={`self-start text-xs font-medium px-2 py-0.5 rounded ${ROL_BADGE[r]}`}>{ROL_LABEL[r]}</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{ROL_DESCRIPCION[r]}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <Info size={13} className="mt-0.5 flex-shrink-0" />
                            Para entrar, la persona necesita una cuenta de Microsoft de THO (@tho.cl). Aquí autorizas esa cuenta antes o después de su primer ingreso.
                        </p>
                    </div>
                </div>
            </div>

            {/* Agregar */}
            {asignables.length > 0 && (
                <form onSubmit={agregar} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 md:p-5">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2"><UserPlus size={16} /> Dar acceso</h3>
                    <div className="grid md:grid-cols-[1.4fr_1fr_auto_auto] gap-2">
                        <input type="email" required placeholder="nombre@tho.cl" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" aria-label="Email" />
                        <input type="text" placeholder="Nombre (opcional)" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                            className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" aria-label="Nombre" />
                        <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as RolCRM }))}
                            className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-sm" aria-label="Rol">
                            {asignables.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                        </select>
                        <button type="submit" disabled={ocupado === '__form'} className="px-4 py-2 rounded-lg color-naranja text-white text-sm font-medium disabled:opacity-50">Dar acceso</button>
                    </div>
                </form>
            )}

            {/* Lista */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Personas con acceso al CRM</h3>
                    <button onClick={() => void cargar()} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Actualizar" aria-label="Actualizar">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700/40">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium">Persona</th>
                                <th className="px-4 py-2 text-left font-medium">Rol</th>
                                <th className="px-4 py-2 text-left font-medium">Estado</th>
                                <th className="px-4 py-2 text-left font-medium">Último ingreso</th>
                                <th className="px-4 py-2 text-right font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {miembros.map(m => {
                                const esYo = m.email === yo
                                const admin = puedeAdministrar(yo, miRol, m)
                                const cuenta = cuentaPorEmail.get(m.email)
                                const busy = ocupado === m.email
                                const puedeNombre = esYo || admin
                                return (
                                    <tr key={m.email} className={`${m.activo ? '' : 'opacity-60'} ${busy ? 'animate-pulse' : ''}`}>
                                        <td className="px-4 py-2.5">
                                            {puedeNombre ? (
                                                <input value={nombres[m.email] ?? ''} placeholder="Sin nombre" onChange={e => setNombres(n => ({ ...n, [m.email]: e.target.value }))}
                                                    onBlur={() => void guardarNombre(m)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                                    className="w-full bg-transparent font-medium text-gray-900 dark:text-gray-100 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-naranja rounded px-1 -mx-1" aria-label={`Nombre de ${m.email}`} />
                                            ) : (
                                                <div className="font-medium text-gray-900 dark:text-gray-100">{m.nombre || '—'}</div>
                                            )}
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{m.email}{esYo && ' · tú'}</div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {admin ? (
                                                <select value={m.rol} disabled={busy} onChange={e => void cambiarRol(m, e.target.value as RolCRM)}
                                                    className="px-2 py-1 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-xs" aria-label={`Rol de ${m.email}`}>
                                                    {Array.from(new Set([m.rol, ...asignables])).map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                                                </select>
                                            ) : (
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${ROL_BADGE[m.rol]}`}>{ROL_LABEL[m.rol]}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center gap-1.5 text-xs ${m.activo ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${m.activo ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                                {m.activo ? 'Activo' : 'Desactivado'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                            {cuentas === null ? '—' : cuenta?.ultimo_ingreso ? formatDateTime(cuenta.ultimo_ingreso) : cuenta ? 'Nunca' : 'Aún no entra'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            {admin && (
                                                <div className="inline-flex gap-1">
                                                    <button onClick={() => void toggleActivo(m)} disabled={busy} title={m.activo ? 'Desactivar acceso' : 'Reactivar acceso'} aria-label={m.activo ? 'Desactivar acceso' : 'Reactivar acceso'}
                                                        className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${m.activo ? 'text-gray-500' : 'text-green-600'}`}>
                                                        <Power size={15} />
                                                    </button>
                                                    <button onClick={() => void eliminar(m)} disabled={busy} title="Quitar del CRM" aria-label="Quitar del CRM"
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {!loading && miembros.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No hay accesos registrados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Otras cuentas de inicio de sesión (sólo superadmin) */}
            {miRol === 'superadmin' && cuentas !== null && otrasCuentas.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl">
                    <div className="px-4 py-3 border-b dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><KeyRound size={15} /> Otras cuentas de inicio de sesión</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cuentas que existen en Supabase pero no tienen acceso al CRM. Suelen ser de Studio (tho.cl): borrarlas también les quita ese acceso.</p>
                    </div>
                    <ul className="divide-y dark:divide-gray-700">
                        {otrasCuentas.map(c => (
                            <li key={c.email} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${ocupado === c.email ? 'animate-pulse' : ''}`}>
                                <div className="min-w-0">
                                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{c.email}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {c.proveedor ? `Entra con ${c.proveedor}` : 'Proveedor desconocido'} · último ingreso {c.ultimo_ingreso ? formatDateTime(c.ultimo_ingreso) : 'nunca'}
                                    </div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => { setForm({ email: c.email, nombre: '', rol: 'usuario' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                        className="px-2.5 py-1 text-xs rounded-lg border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Dar acceso</button>
                                    <button onClick={() => void borrarCuentaExterna(c)} disabled={ocupado === c.email}
                                        className="px-2.5 py-1 text-xs rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Borrar cuenta</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Bitácora */}
            {registro.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl">
                    <h3 className="px-4 py-3 border-b dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><History size={15} /> Últimos cambios de acceso</h3>
                    <ul className="divide-y dark:divide-gray-700">
                        {registro.map(r => (
                            <li key={r.id} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-2">
                                <span className="text-gray-400 tnum">{formatDateTime(r.fecha)}</span>
                                <span>{describirCambio(r)}</span>
                                <span className="text-gray-400">· {r.actor || 'sistema'}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function describirCambio(r: RegistroAcceso): string {
    if (r.accion === 'INSERT') return `${r.email} recibió acceso como ${ROL_LABEL[(r.despues?.rol as RolCRM) || 'usuario']}`
    if (r.accion === 'DELETE') return `${r.email} fue quitado del CRM`
    const a = r.antes || {}, d = r.despues || {}
    const partes: string[] = []
    if (a.rol !== d.rol && d.rol) partes.push(`rol ${ROL_LABEL[a.rol as RolCRM] || a.rol} → ${ROL_LABEL[d.rol as RolCRM]}`)
    if (a.activo !== d.activo) partes.push(d.activo ? 'reactivado' : 'desactivado')
    if (a.nombre !== d.nombre) partes.push('nombre actualizado')
    return `${r.email}: ${partes.join(', ') || 'actualizado'}`
}
