import { useState, useMemo } from 'react'

function MetricCard({ title, value, subtitle, color }) {
  const colorMap = {
    naranja: 'border-naranja text-naranja',
    verde: 'border-verde text-verde',
    azul: 'border-azul text-azul',
    fucsia: 'border-fucsia text-fucsia',
  }
  const cls = colorMap[color] || 'border-gray-400 text-gray-800'
  return (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${cls.split(' ')[0]}`}>
      <div className="text-sm text-gray-600 mb-2">{title}</div>
      <div className={`text-3xl font-bold ${cls.split(' ')[1]} mb-1`}>{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  )
}

export default function Dashboard({ metrics, prospectos, cerrados, tickets, keyAccounts, user, ufActual, monedaPreferida, setMonedaPreferida, actividadReciente }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">
          Hola, {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Equipo'} 👋
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard title="Prospectos" value={metrics?.totalProspectos || 0} subtitle="Activos" color="azul" />
        <MetricCard title="Propuestas" value={metrics?.propuestasEnviadas || 0} subtitle="Enviadas" color="naranja" />
        <MetricCard title="Pipeline" value={`${Math.round(metrics?.pipelineTotal || 0)} UF`} subtitle="Total" color="verde" />
        <MetricCard title="Cerrados" value={metrics?.cerradosEsteMes || 0} subtitle="Este mes" color="verde" />
        <MetricCard title="Conversión" value={`${metrics?.tasaConversion || 0}%`} subtitle="Tasa" color="azul" />
        <MetricCard title="Hot" value={metrics?.proximosCierres || 0} subtitle=">60%" color="fucsia" />
      </div>

      {/* Actividad Reciente */}
      {actividadReciente && actividadReciente.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Actividad Reciente</h3>
          <div className="space-y-3">
            {actividadReciente.slice(0, 10).map((act, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border-b pb-2">
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {act.fecha ? new Date(act.fecha).toLocaleDateString('es-CL') : ''}
                </span>
                <span className="text-gray-700">{act.descripcion || act.texto || JSON.stringify(act)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
