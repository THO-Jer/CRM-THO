/**
 * Tipos generados manualmente desde los schemas SQL del proyecto.
 * Archivo: src/types/supabase.ts
 *
 * Cuando tengas acceso a Supabase CLI puedes reemplazar esto con:
 *   npx supabase gen types typescript --project-id <ID> > src/types/supabase.ts
 *
 * Por ahora estos tipos se derivan de:
 *   - sql/bloque2-migration.sql
 *   - sql/limpieza-schema-A.sql
 *   - sql/fix-conciliacion-columns.sql
 *   - Lectura del código del CRM
 */

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** ISO 8601 date string, e.g. "2025-03-01" */
export type DateString = string

/** ISO 8601 datetime string with timezone */
export type TimestampString = string

// ─────────────────────────────────────────────
// PIPELINE
// ─────────────────────────────────────────────

export type EstadoProspecto =
  | 'Nuevo Lead'
  | 'Contactado'
  | 'Reunión'
  | 'Propuesta'
  | 'Negociación'
  | 'Convertido'
  | 'Cerrado Perdido'

export interface Prospecto {
  id: string                        // UUID
  organizacion: string
  contacto: string | null
  tipo: string | null               // tipo de servicio
  valor: number | null              // en UF
  estado: EstadoProspecto | string
  probabilidad: number | null       // 0-100
  fecha_limite: DateString | null
  proximo_paso: string | null
  origen: string | null
  notas: string | null
  created_at: TimestampString | null
  created_by_email: string | null
  updated_at: TimestampString | null
}

// ─────────────────────────────────────────────
// CERRADOS (deals ganados/perdidos)
// ─────────────────────────────────────────────

export interface Cerrado {
  id: string
  organizacion: string
  contacto: string | null
  tipo: string | null
  valor: number | null
  valor_total_final: number | null   // valor final del deal (puede diferir de valor original)
  estado: 'Ganado' | 'Perdido' | string
  estado_final: string | null        // estado de cierre detallado
  razon_perdida: string | null       // razón específica de pérdida del deal
  motivo_cierre: string | null
  fecha_cierre: DateString | null
  fecha_inicio: string | null
  fecha_termino: string | null
  duracion_meses: number | null
  notas: string | null
  convertido_a: 'ticket' | 'keyaccount' | null
  created_at: TimestampString | null
  created_by_email: string | null
}

// ─────────────────────────────────────────────
// TICKETS (clientes activos con contrato)
// ─────────────────────────────────────────────

export type SaludTicket = 'OK' | 'En Riesgo' | 'Vencido' | 'Cerrado' | 'Riesgo' | 'Crítico' | 'Excelente' | 'Buena' | string

export interface Ticket {
  id: string
  organizacion: string
  contacto: string | null
  tipo: string | null
  ticket: string | null              // nombre/título del ticket
  status: string | null              // estado de ejecución (ej: 'Activo', 'Cerrado')
  porcentaje_avance: number | null   // 0-100
  fase_actual: string | null         // fase actual de ejecución
  fecha_inicio: DateString | null
  fecha_entrega: DateString | null
  responsable: string | null
  valor_monto: number | null         // valor monetario del ticket
  valor_moneda: string | null        // 'UF' | 'CLP' | 'USD'
  uf_mes: number | null
  inicio_contrato: DateString | null
  fin_contrato: DateString | null
  salud: SaludTicket | null
  estado: string | null
  notas: string | null
  created_at: TimestampString | null
  created_by_email: string | null
  updated_at: TimestampString | null
}

// ─────────────────────────────────────────────
// KEY ACCOUNTS
// ─────────────────────────────────────────────

export interface KeyAccount {
  id: string
  organizacion: string
  contacto: string | null
  tipo: string | null
  servicio: string | null            // nombre del servicio contratado
  renovacion: string | null          // estado de renovación del contrato
  uf_mes: number | null
  inicio_contrato: DateString | null
  fin_contrato: DateString | null
  salud: SaludTicket | null
  notas: string | null
  created_at: TimestampString | null
  created_by_email: string | null
  updated_at: TimestampString | null
}

// ─────────────────────────────────────────────
// CONTACTOS
// ─────────────────────────────────────────────

export interface Contacto {
  id: string
  organizacion: string
  nombre: string
  cargo: string | null
  email: string | null
  telefono: string | null
  linkedin: string | null
  notas: string | null
  es_principal: boolean
  created_at: TimestampString | null
  created_by_email: string | null
}

// ─────────────────────────────────────────────
// NOTAS / ACTIVIDADES
// ─────────────────────────────────────────────

export type EntidadTipo = 'prospecto' | 'cerrado' | 'ticket' | 'keyaccount'
export type TipoNota = 'nota' | 'llamada' | 'reunion' | 'email' | 'tarea'

export interface Nota {
  id: string
  entidad_tipo: EntidadTipo
  entidad_id: string
  tipo: TipoNota
  contenido: string
  completada: boolean
  fecha_actividad: TimestampString | null
  created_at: TimestampString | null
  created_by_email: string | null
}

// ─────────────────────────────────────────────
// CONTABILIDAD — FACTURAS
// ─────────────────────────────────────────────

export type EstadoFactura =
  | 'Pendiente'
  | 'Pagada'
  | 'Vencida'
  | 'Reclamada'
  | 'Anulada'

export type MonedaPrincipal = 'UF' | 'CLP'

/** Facturas emitidas por THO a clientes */
export interface FacturaEmitida {
  id: string | number
  folio: string | null
  organizacion: string | null
  descripcion: string | null
  monto_neto: number | null
  monto_iva: number | null
  monto_total: number | null
  moneda_principal: MonedaPrincipal | null
  monto_uf: number | null
  uf_dia: number | null
  fecha_emision: DateString | null
  fecha_vencimiento: DateString | null
  fecha_pago: DateString | null
  estado: EstadoFactura | string
  categoria: string | null
  created_at: TimestampString | null
}

/** Facturas recibidas por THO de proveedores */
export interface FacturaRecibida {
  id: string | number
  folio: string | null
  rut_proveedor: string | null
  razon_social_proveedor: string | null
  descripcion: string | null
  monto_neto: number | null
  monto_iva: number | null
  monto_total: number | null
  moneda_principal: MonedaPrincipal | null   // agregada en limpieza-schema-A
  monto_uf: number | null
  uf_dia: number | null
  fecha_emision: DateString | null
  fecha_vencimiento: DateString | null
  fecha_pago: DateString | null
  estado: EstadoFactura | string
  categoria: string | null
  created_at: TimestampString | null
}

/** Boletas de honorarios */
export interface BoletaHonorario {
  id: string | number
  folio: string | null
  rut_emisor: string | null
  nombre_emisor: string | null
  descripcion: string | null
  monto_bruto: number | null
  monto_retencion: number | null
  monto_liquido: number | null
  moneda_principal: MonedaPrincipal | null
  monto_uf: number | null
  uf_dia: number | null
  fecha_emision: DateString | null
  fecha_pago: DateString | null
  estado: EstadoFactura | string
  categoria: string | null
  created_at: TimestampString | null
}

// ─────────────────────────────────────────────
// CONTABILIDAD — MOVIMIENTOS BANCARIOS
// ─────────────────────────────────────────────

export type EstadoConciliacion =
  | 'pendiente'
  | 'conciliado'
  | 'ignorar'

export interface MovimientoBancario {
  id: string
  fecha: DateString | null
  descripcion: string | null
  monto: number | null
  monto_uf: number | null
  uf_dia: number | null
  tipo: 'abono' | 'cargo' | string | null
  estado_conciliacion: EstadoConciliacion | null
  conciliado_con_tipo: string | null   // 'factura_emitida' | 'factura_recibida' | etc
  conciliado_con_id: string | null     // TEXT (no UUID), puede ser folio SII
  conciliado_at: TimestampString | null
  numero_documento: string | null
  sucursal: string | null
  archivo_origen: string | null
  created_at: TimestampString | null
}

// ─────────────────────────────────────────────
// CONTABILIDAD — OTROS
// ─────────────────────────────────────────────

export interface SueldoSocio {
  id: string
  socio: string
  mes: string                          // formato "YYYY-MM"
  monto_bruto: number | null
  monto_liquido: number | null
  moneda_principal: MonedaPrincipal | null
  monto_uf: number | null
  uf_dia: number | null
  fecha_pago: DateString | null
  estado: EstadoFactura | string | null
  created_at: TimestampString | null
}

export interface CajaChica {
  id: string
  descripcion: string
  monto: number
  fecha: DateString
  categoria: string | null
  estado: string | null
  created_at: TimestampString | null
  created_by_email: string | null
}

// ─────────────────────────────────────────────
// CRM — EVENTOS Y TRAZABILIDAD
// ─────────────────────────────────────────────

export interface CrmEvent {
  id: string
  entidad_tipo: EntidadTipo | string
  entidad_id: string
  tipo_evento: string
  descripcion: string | null
  metadata: Record<string, unknown> | null
  created_at: TimestampString | null
  created_by_email: string | null
}

export interface CrmTransition {
  id: string
  entidad_tipo: EntidadTipo | string
  entidad_id: string
  desde: string | null
  hasta: string
  created_at: TimestampString | null
  created_by_email: string | null
}

export interface CrmRenewal {
  id: string
  ticket_id: string | null
  ka_id: string | null
  fecha_vencimiento: DateString | null
  status: 'pending' | 'renewed' | 'cancelled' | string
  cancel_reason: string | null
  notes: string | null
  created_at: TimestampString | null
}

export interface CrmEntityLink {
  id: string
  desde_tipo: string
  desde_id: string
  hasta_tipo: string
  hasta_id: string
  relacion: string | null
  created_at: TimestampString | null
}

// ─────────────────────────────────────────────
// DATABASE — mapa completo de tablas
// ─────────────────────────────────────────────

/**
 * Mapa de tablas de Supabase.
 * Usar con el cliente tipado: supabase.from<Database['public']['Tables']['prospectos']['Row']>('prospectos')
 *
 * Por ahora se usa directamente con los tipos individuales arriba.
 * Cuando se migre a supabase gen types, este objeto se reemplaza automáticamente.
 */
export type TableName =
  | 'prospectos'
  | 'cerrados'
  | 'tickets'
  | 'key_accounts'
  | 'contactos'
  | 'notas'
  | 'facturas_emitidas'
  | 'facturas_recibidas'
  | 'boletas_honorarios'
  | 'movimientos_bancarios'
  | 'sueldos_socios'
  | 'caja_chica'
  | 'crm_events'
  | 'crm_transitions'
  | 'crm_renewals'
  | 'crm_entity_links'
  | 'crm-archivos'
