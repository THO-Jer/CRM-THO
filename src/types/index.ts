/**
 * Tipos de dominio y UI del CRM-THO.
 * Importar desde aquí en componentes nuevos o migrados a TS.
 *
 * Ejemplo:
 *   import type { Prospecto, EstadoProspecto } from '@/types'
 */

// Re-exportar todo desde supabase.ts para tener un único punto de entrada
export type {
  // Helpers
  DateString,
  TimestampString,
  TableName,
  // Pipeline
  Prospecto,
  EstadoProspecto,
  Cerrado,
  // Activos
  Ticket,
  KeyAccount,
  SaludTicket,
  // Contactos y notas
  Contacto,
  Nota,
  EntidadTipo,
  TipoNota,
  // Contabilidad
  FacturaEmitida,
  FacturaRecibida,
  BoletaHonorario,
  Liquidacion,
  EstadoLiquidacion,
  MovimientoBancario,
  SueldoSocio,
  CajaChica,
  EstadoFactura,
  EstadoConciliacion,
  MonedaPrincipal,
  // Trazabilidad
  CrmEvent,
  CrmTransition,
  CrmRenewal,
  CrmEntityLink,
} from './supabase'

// ─────────────────────────────────────────────
// TIPOS DE UI / COMPONENTES
// ─────────────────────────────────────────────

/** Columna del Kanban — estado del pipeline */
export interface KanbanEstado {
  id: string
  label: string
  color?: string
}

/** Opción genérica para <select> */
export interface SelectOption {
  value: string
  label: string
}

/** Resultado de operación con Supabase */
export interface SupabaseResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

/** Contexto del usuario autenticado */
export interface UsuarioActivo {
  email: string
  nombre?: string
  es_socio: boolean
}

/** Props genéricas para modales */
export interface ModalProps {
  isOpen: boolean
  onClose: () => void
}

/** Entidad genérica para el detalle universal */
export type EntidadDetalle =
  | { tipo: 'prospecto'; data: import('./supabase').Prospecto }
  | { tipo: 'ticket';    data: import('./supabase').Ticket }
  | { tipo: 'keyaccount'; data: import('./supabase').KeyAccount }
  | { tipo: 'cerrado';   data: import('./supabase').Cerrado }

/** Vista activa del CRM */
export type VistaActiva =
  | 'pipeline'
  | 'tickets'
  | 'keyaccounts'
  | 'cerrados'
  | 'contabilidad'
  | 'reportes'
  | 'admin'

/** Tipo de documento contable */
export type TipoDocumento =
  | 'factura_emitida'
  | 'factura_recibida'
  | 'boleta_honorario'
  | 'liquidacion'
  | 'movimiento_bancario'
  | 'sueldo_socio'
  | 'caja_chica'
