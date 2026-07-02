import type { FilterSpec } from './charts'

export type DashboardStatus = 'draft' | 'archived'

export interface Dashboard {
  id: string
  name: string
  description: string | null
  status: DashboardStatus
  global_filters: FilterSpec[]
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface PositionConfig {
  x: number
  y: number
  w: number
  h: number
}

// local_config: filtros propios del item ({filters: FilterSpec[]}) o el
// contenido del widget de texto ({content: string}).
export interface DashboardItem {
  id: string
  dashboard_id: string
  chart_id: string | null
  item_type: 'chart' | 'text'
  position_config: PositionConfig
  local_config: Record<string, unknown>
}

export interface DashboardDetail extends Dashboard {
  items: DashboardItem[]
}

export interface DashboardCreate {
  name: string
  description?: string | null
}

export interface DashboardUpdate {
  name?: string
  description?: string | null
  global_filters?: FilterSpec[]
}

export interface DashboardItemPayload {
  chart_id?: string | null
  item_type: 'chart' | 'text'
  position_config: PositionConfig
  local_config?: Record<string, unknown>
}
