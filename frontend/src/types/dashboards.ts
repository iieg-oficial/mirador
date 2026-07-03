// Tipos del módulo de tableros. Espejo de los schemas Pydantic del backend
// (`app/modules/dashboards/schemas.py`). Un tablero es configuración (JSON),
// no HTML: una cuadrícula de items que referencian Charts existentes o texto
// Markdown, más filtros globales aplicados a todos los items `chart`.

import type { DashboardFilter } from '@/features/dashboards/filters/dashboardFilters'

// Solo 2 estados en el backend (models.py DashboardStatus): "archivar" es en
// realidad el soft-delete de DELETE /{id} (pone status=archived y lo saca del
// listado); no hay in_review/approved/published en este alcance (ver CLAUDE.md
// sobre el flujo de 5 estados como diseño futuro pospuesto).
export type DashboardStatus = 'draft' | 'archived'

export const DASHBOARD_STATUS_LABELS: Record<DashboardStatus, string> = {
  draft: 'Borrador',
  archived: 'Archivado',
}

export type DashboardItemType = 'chart' | 'markdown'

export interface PositionConfig {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardItemRead {
  id: string
  dashboard_id: string
  chart_id: string | null
  item_type: DashboardItemType
  position_config: PositionConfig
  local_config: Record<string, unknown>
}

export interface DashboardItemPayload {
  chart_id?: string | null
  item_type: DashboardItemType
  position_config: PositionConfig
  local_config: Record<string, unknown>
}

export interface DashboardRead {
  id: string
  name: string
  description: string | null
  status: DashboardStatus
  global_filters: DashboardFilter[]
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface DashboardDetail extends DashboardRead {
  items: DashboardItemRead[]
}

export interface DashboardCreate {
  name: string
  description?: string | null
}

export interface DashboardUpdate {
  name?: string
  description?: string | null
  global_filters?: DashboardFilter[]
}
