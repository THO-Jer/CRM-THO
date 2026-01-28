import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const ESTADOS = ['Contactado','Reunión agendada','Propuesta enviada','Negociación','Cerrado']

const probPorEstado = (e) => ({
  'Contactado':10,
  'Reunión agendada':25,
  'Propuesta enviada':40,
  'Negociación':70,
  'Cerrado':100,
}[e] ?? 10)

export default function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [prospectos, setProspectos] = useState([])
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      setUser(s?.user ?? null)
    })
    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) { setProspectos([]); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('prospectos').select('*').order('fecha_limite', { ascending: true })
    if (error) {
      console.error(error)
      setProspectos([])
    } else {
      setProspectos(data ?? [])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return prospectos
    return prospectos.filter(p =>
      (p.organizacion ?? '').toLowerCase().includes(term) ||
      (p.contacto ?? '').toLowerCase().includes(term) ||
      (p.tipo ?? '').toLowerCase().includes(term) ||
      (p.estado ?? '').toLowerCase().includes(term)
    )
  }, [prospectos, q])

  const metrics = useMemo(() => {
    const pipeline = prospectos.filter(p => p.estado !== 'Cerrado')
    const totalUF = pipeline.reduce((s,p)=>s+(Number(p.valor)||0),0)
    return {
      activos: pipeline.length,
      reuniones: pipeline.filter(p=>p.estado==='Reunión agendada').length,
      propuestas: pipeline.filter(p=>p.estado==='Propuesta enviada').length,
      totalUF
    }
  }, [prospectos])

  async function save(data) {
    const payload = {
      organizacion: data.organizacion,
      contacto: data.contacto,
      tipo: data.tipo,
      estado: data.estado,
      valor: Number(data.valor),
      proximo_paso: data.proximo_paso,
      fecha_limite: data.fecha_limite,
      notas: data.notas ?? null,
      probabilidad: probPorEstado(data.estado),
    }

    if (editing) {
      const { error } = await supabase.from('prospectos').update(payload).eq('id', editing.id)
      if (error) return alert('No se pudo guardar (RLS / tabla).')
    } else {
      const { error } = await supabase.from('prospectos').insert({ ...payload, fecha_contacto: new Date().toISOString().slice(0,10) })
      if (error) return alert('No se pudo crear (tabla no existe o RLS).')
    }
    setShowForm(false)
    setEditing(null)
    await load()
  }

  async function del(id) {
    if (!confirm('¿Eliminar este prospecto?')) return
    const { error } = await supabase.from('prospectos').delete().eq('id', id)
    if (error) return alert('No se pudo eliminar (RLS).')
    await load()
  }

  if (loading && !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Cargando…</div>
  }

  if (!user) {
    return <Auth />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-naranja">CRM THO</div>
            <div className="text-xs text-gray-500">The Human Org</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={()=>{setEditing(null); setShowForm(true)}} className="px-4 py-2 bg-naranja text-white rounded-lg hover:bg-orange-600">
              + Nuevo
            </button>
            <div className="text-sm text-gray-600">{user.email}</div>
            <button onClick={()=>supabase.auth.signOut()} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">Salir</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Metric title="Activos" value={metrics.activos} />
          <Metric title="Reuniones" value={metrics.reuniones} />
          <Metric title="Propuestas" value={metrics.propuestas} />
          <Metric title="Pipeline UF" value={metrics.totalUF} />
        </section>

        <section className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold text-gray-800">Prospectos</div>
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Buscar…" className="px-3 py-2 border rounded-lg w-full md:w-80" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2">Organización</th>
                  <th className="py-2">Contacto</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">UF</th>
                  <th className="py-2">Fecha límite</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(p => (
                  <tr key={p.id} className="text-gray-800">
                    <td className="py-2 font-medium">{p.organizacion}</td>
                    <td className="py-2">{p.contacto}</td>
                    <td className="py-2">{p.tipo}</td>
                    <td className="py-2">
                      <span className="px-2 py-1 rounded bg-gray-100">{p.estado}</span>
                    </td>
                    <td className="py-2 font-semibold text-naranja">{p.valor}</td>
                    <td className="py-2">{p.fecha_limite}</td>
                    <td className="py-2 text-right">
                      <button onClick={()=>{setEditing(p); setShowForm(true)}} className="text-azul font-medium mr-3">Editar</button>
                      <button onClick={()=>del(p.id)} className="text-red-600 font-medium">Eliminar</button>
                    </td>
                  </tr>
                ))}
                {filtered.length===0 && (
                  <tr><td className="py-6 text-center text-gray-500" colSpan={7}>Sin prospectos (aún).</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Si ves errores al crear/leer, falta crear la tabla o activar RLS (ver README).
          </div>
        </section>
      </main>

      {showForm && (
        <ProspectoForm
          initial={editing}
          onClose={()=>{setShowForm(false); setEditing(null)}}
          onSave={save}
        />
      )}
    </div>
  )
}

function Metric({ title, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
    </div>
  )
}

function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const doLogin = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg(error.message)
    setBusy(false)
  }

  const doSignup = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMsg(error.message)
    else setMsg('Cuenta creada. Revisa tu email si la confirmación está activada.')
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-pink-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-naranja">CRM THO</div>
          <div className="text-sm text-gray-600">Acceso</div>
        </div>

        <div className="flex gap-2 mb-4">
          <button className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode==='login'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setMode('login')}>
            Iniciar sesión
          </button>
          <button className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode==='signup'?'bg-gray-900 text-white':'bg-gray-100'}`} onClick={()=>setMode('signup')}>
            Crear cuenta
          </button>
        </div>

        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          {msg && <div className="text-sm text-red-600">{msg}</div>}
          <button
            disabled={busy || !email || !password}
            className="w-full py-3 rounded-lg bg-naranja text-white font-medium disabled:opacity-50 hover:bg-orange-600"
            onClick={mode==='login'?doLogin:doSignup}
          >
            {mode==='login'?'Entrar':'Crear cuenta'}
          </button>
          <div className="text-xs text-gray-500 text-center">
            Nota: la seguridad real depende de RLS en Supabase (README).
          </div>
        </div>
      </div>
    </div>
  )
}

function ProspectoForm({ initial, onClose, onSave }) {
  const [data, setData] = useState(() => initial ? ({
    organizacion: initial.organizacion ?? '',
    contacto: initial.contacto ?? '',
    tipo: initial.tipo ?? 'Ticket RC Express',
    estado: initial.estado ?? 'Contactado',
    valor: initial.valor ?? '',
    proximo_paso: initial.proximo_paso ?? '',
    fecha_limite: initial.fecha_limite ?? '',
    notas: initial.notas ?? '',
  }) : ({
    organizacion: '',
    contacto: '',
    tipo: 'Ticket RC Express',
    estado: 'Contactado',
    valor: '',
    proximo_paso: '',
    fecha_limite: '',
    notas: '',
  }))

  const submit = (e) => {
    e.preventDefault()
    onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-bold">{initial ? 'Editar prospecto' : 'Nuevo prospecto'}</div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Organización *">
              <input required className="w-full px-3 py-2 border rounded-lg" value={data.organizacion} onChange={(e)=>setData({...data, organizacion:e.target.value})} />
            </Field>
            <Field label="Contacto *">
              <input required className="w-full px-3 py-2 border rounded-lg" value={data.contacto} onChange={(e)=>setData({...data, contacto:e.target.value})} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo *">
              <select className="w-full px-3 py-2 border rounded-lg" value={data.tipo} onChange={(e)=>setData({...data, tipo:e.target.value})}>
                <option>Ticket RC Express</option>
                <option>Ticket Diag Org</option>
                <option>Ticket ESG</option>
                <option>Key Account Nivel 1</option>
                <option>Key Account Nivel 2</option>
                <option>Key Account Nivel 3</option>
              </select>
            </Field>
            <Field label="Estado *">
              <select className="w-full px-3 py-2 border rounded-lg" value={data.estado} onChange={(e)=>setData({...data, estado:e.target.value})}>
                {ESTADOS.map(e => <option key={e}>{e}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Valor UF *">
              <input required type="number" className="w-full px-3 py-2 border rounded-lg" value={data.valor} onChange={(e)=>setData({...data, valor:e.target.value})} />
            </Field>
            <Field label="Fecha límite *">
              <input required type="date" className="w-full px-3 py-2 border rounded-lg" value={data.fecha_limite} onChange={(e)=>setData({...data, fecha_limite:e.target.value})} />
            </Field>
          </div>

          <Field label="Próximo paso *">
            <input required className="w-full px-3 py-2 border rounded-lg" value={data.proximo_paso} onChange={(e)=>setData({...data, proximo_paso:e.target.value})} />
          </Field>

          <Field label="Notas">
            <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} value={data.notas} onChange={(e)=>setData({...data, notas:e.target.value})} />
          </Field>

          <div className="flex gap-3 pt-2">
            <button className="flex-1 py-2 rounded-lg bg-naranja text-white font-medium hover:bg-orange-600" type="submit">Guardar</button>
            <button className="flex-1 py-2 rounded-lg bg-gray-200 font-medium hover:bg-gray-300" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  )
}
