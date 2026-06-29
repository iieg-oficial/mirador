export type ChartType =
  | 'bar'
  | 'bar_horizontal'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'

export interface FieldMapping {
  x: string
  y: string
  series?: string | null
}

export interface VisualConfig {
  title?: string | null
  subtitle?: string | null
  show_legend?: boolean
  legend_position?: 'top' | 'bottom' | 'left' | 'right'
}

export interface Chart {
  id: string
  dataset_id: string
  name: string
  description: string | null
  renderer: string
  chart_type: ChartType
  field_mapping: FieldMapping
  visual_config: VisualConfig
  status: string
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface ChartCreate {
  dataset_id: string
  name: string
  description?: string | null
  chart_type: ChartType
  field_mapping: FieldMapping
  visual_config: VisualConfig
}

export interface ChartUpdate {
  name?: string
  description?: string | null
  chart_type?: ChartType
  field_mapping?: FieldMapping
  visual_config?: VisualConfig
  status?: string
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Barras verticales',
  bar_horizontal: 'Barras horizontales',
  line: 'Líneas',
  area: 'Área',
  pie: 'Pastel',
  donut: 'Dona',
  scatter: 'Dispersión',
}
