import { useState, useMemo } from 'react'

function MetricCard({ title, value, subtitle, color }) {
  const colorMap = {
    naranja: 'border-naranja text-naranja',
    verde: 'border-verde text-verde',
    azul: 'border-azul text-azul',
    fucsia: 'border-fucsia text-fucsia',
    red: 'border-red-500 text-red-500',
  }
  const cls = colorMap[color] || 'border-gray-400 text-gray-800'
  return (
    <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${cls.split(' ')[0]} hover:shadow-md transition-shadow`}>
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${cls.split(' ')[1]} mb-0.5`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}

export default function Dashboard({ metrics, prospectos, cerrados, tickets, keyAccounts, user, ufActual, monedaPreferida, setMonedaPreferida, actividadReciente }) {
  const [showAlertDetails, setShowAlertDetails] = useState(false);

  const m = metrics || {};
  
  // Pipeline por etapa
  const pipelineByStage = useMemo(() => {
    const stages = [
      { key: 'Contactado', label: 'Contactado', emoji: '🔵' },
      { key: 'Reunión agendada', label: 'Reunión', emoji: '🟡' },
      { key: 'Propuesta enviada', label: 'Propuesta', emoji: '🟠' },
      { key: 'Negociación', label: 'Negociación', emoji: '🟢' },
    ];
    return stages.map(s => ({
      ...s,
      count: (prospectos || []).filter(p => p.estado === s.key).length,
      value: Math.round((prospectos || []).filter(p => p.estado === s.key).reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0))
    }));
  }, [prospectos]);

  // Total alertas
  const totalAlertas = (m.prospectosVencidos || 0) + (m.prospectosSinActividad || 0) + (m.keyAccountsPorRenovar || 0);

  // Variación arrow
  const variacionIcon = m.variacionIngresos > 0 ? '📈' : m.variacionIngresos < 0 ? '📉' : '➡️';
  const variacionText = m.variacionIngresos !== undefined 
    ? `${m.variacionIngresos > 0 ? '+' : ''}${Math.round(m.variacionIngresos)}% vs mes anterior`
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-800">
          Hola, {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Equipo'} 👋
        </h2>
        <div className="text-sm text-gray-500">
          UF: ${ufActual?.toLocaleString('es-CL') || '---'}
        </div>
      </div>

      {/* Salud del Negocio */}
      {m.saludNegocio && (
        <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${
          m.saludColor === 'verde' ? 'border-verde' : 
          m.saludColor === 'naranja' ? 'border-naranja' : 
          m.saludColor === 'red' ? 'border-red-500' : 'border-gray-400'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-800">
                  {m.saludNegocio === 'Excelente' ? '🟢' : m.saludNegocio === 'Saludable' ? '🟢' : m.saludNegocio === 'Requiere atención' ? '🟡' : '🔴'}
                  {' '}Estado del Negocio: {m.saludNegocio}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{m.saludMensaje}</p>
            </div>
            {m.saludDetalles && m.saludDetalles.length > 0 && (
              <button 
                onClick={() => setShowAlertDetails(!showAlertDetails)}
                className="text-sm text-azul hover:underline flex-shrink-0"
              >
                {showAlertDetails ? 'Ocultar' : 'Ver detalles'}
              </button>
            )}
          </div>
          {showAlertDetails && m.saludDetalles && (
            <div className="mt-3 pt-3 border-t space-y-1">
              {m.saludDetalles.map((d, i) => (
                <p key={i} className="text-sm text-gray-700">{d}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Métricas principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard title="Pipeline" value={`${Math.round(m.pipelineTotal || 0)} UF`} subtitle={`${m.totalProspectos || 0} prospectos activos`} color="azul" />
        <MetricCard title="MRR" value={`${Math.round(m.mrrActual || 0)} UF`} subtitle="Ingreso recurrente mensual" color="verde" />
        <MetricCard title="Ingresos Mes" value={`${Math.round(m.ingresosEsteMes || 0)} UF`} subtitle={variacionText} color={m.variacionIngresos >= 0 ? 'verde' : 'naranja'} />
        <MetricCard title="Tickets" value={`${Math.round(m.valorTickets || 0)} UF`} subtitle={`${(tickets || []).filter(t => t.status === 'Activo').length} activos`} color="naranja" />
        <MetricCard title="Conversión" value={`${m.tasaConversion || 0}%`} subtitle={`Anterior: ${m.tasaConversionMesAnterior || 0}%`} color="azul" />
        <MetricCard title="Hot Leads" value={m.proximosCierres || 0} subtitle=">60% probabilidad" color="fucsia" />
      </div>

      {/* Pipeline por Etapa + Cerrados este mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline funnel */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-4">🎯 Pipeline por Etapa</h3>
          <div className="space-y-3">
            {pipelineByStage.map(stage => (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="text-lg">{stage.emoji}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{stage.label}</span>
                    <span className="text-gray-600">{stage.count} · {stage.value} UF</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className="bg-azul h-2 rounded-full transition-all"
                      style={{ width: `${m.pipelineTotal > 0 ? Math.max(4, (stage.value / m.pipelineTotal) * 100) : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t text-sm text-gray-600 flex justify-between">
            <span>Total Pipeline</span>
            <span className="font-bold text-azul">{Math.round(m.pipelineTotal || 0)} UF</span>
          </div>
        </div>

        {/* Resumen mensual */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Resumen del Mes</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Cerrados este mes</span>
              <span className="font-bold text-verde">{m.cerradosEsteMes || 0}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Ingresos (MRR + Tickets)</span>
              <span className="font-bold text-verde">{Math.round(m.ingresosEsteMes || 0)} UF</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Variación vs mes anterior</span>
              <span className={`font-bold ${m.variacionIngresos >= 0 ? 'text-verde' : 'text-red-500'}`}>
                {variacionIcon} {m.variacionIngresos !== undefined ? `${m.variacionIngresos > 0 ? '+' : ''}${Math.round(m.variacionIngresos)}%` : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">Key Accounts activos</span>
              <span className="font-bold text-azul">{(keyAccounts || []).filter(ka => ka.estado === 'Activo').length}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Propuestas enviadas</span>
              <span className="font-bold text-naranja">{m.propuestasEnviadas || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {totalAlertas > 0 && (
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-400">
          <h3 className="text-lg font-bold text-gray-800 mb-3">⚠️ Alertas ({totalAlertas})</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {m.prospectosVencidos > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <div className="font-bold text-red-700 text-sm">🔴 Prospectos vencidos</div>
                <div className="text-2xl font-bold text-red-600">{m.prospectosVencidos}</div>
                {m.prospectosVencidosDetalle && m.prospectosVencidosDetalle.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.prospectosVencidosDetalle.slice(0, 3).map((p, i) => (
                      <p key={i} className="text-xs text-red-600 truncate">{p.organizacion}</p>
                    ))}
                    {m.prospectosVencidosDetalle.length > 3 && (
                      <p className="text-xs text-red-400">+{m.prospectosVencidosDetalle.length - 3} más</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {m.prospectosSinActividad > 0 && (
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="font-bold text-orange-700 text-sm">🟡 Sin actividad reciente</div>
                <div className="text-2xl font-bold text-orange-600">{m.prospectosSinActividad}</div>
                {m.prospectosSinActividadDetalle && m.prospectosSinActividadDetalle.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.prospectosSinActividadDetalle.slice(0, 3).map((p, i) => (
                      <p key={i} className="text-xs text-orange-600 truncate">{p.organizacion}</p>
                    ))}
                    {m.prospectosSinActividadDetalle.length > 3 && (
                      <p className="text-xs text-orange-400">+{m.prospectosSinActividadDetalle.length - 3} más</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {m.keyAccountsPorRenovar > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="font-bold text-blue-700 text-sm">🔄 KA por renovar</div>
                <div className="text-2xl font-bold text-blue-600">{m.keyAccountsPorRenovar}</div>
                {m.keyAccountsPorRenovarDetalle && m.keyAccountsPorRenovarDetalle.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.keyAccountsPorRenovarDetalle.slice(0, 3).map((p, i) => (
                      <p key={i} className="text-xs text-blue-600 truncate">{p.organizacion} · {p.servicio}</p>
                    ))}
                    {m.keyAccountsPorRenovarDetalle.length > 3 && (
                      <p className="text-xs text-blue-400">+{m.keyAccountsPorRenovarDetalle.length - 3} más</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actividad Reciente */}
      {actividadReciente && actividadReciente.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Actividad Reciente</h3>
          <div className="space-y-3">
            {actividadReciente.slice(0, 10).map((act, i) => (
              <div key={i} className="flex items-start gap-3 text-sm border-b pb-2 last:border-0">
                <span className="text-lg flex-shrink-0">{act.icono_mejorado || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700">{act.titulo_mejorado || act.title || 'Actividad'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {act.created_at ? new Date(act.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    {act.created_by_email ? ` · ${act.created_by_email.split('@')[0]}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
