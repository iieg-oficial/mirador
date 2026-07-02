export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'candlestick'
  | 'boxplot'
  | 'treemap'

// x/y aceptan varias columnas (ejes multicolumna): y → series múltiples,
// x → categoría compuesta cuando hay más de una columna. series sigue siendo
// una sola columna de agrupación. `fields` lleva columnas nombradas para los
// tipos con forma especial: candlestick (open/close/lowest/highest) y boxplot
// (min/q1/median/q3/max); esos usan x = [categoría] y no usan y.
export interface FieldMapping {
  x: string[]
  y: string[]
  series?: string | null
  fields?: Record<string, string>
}

export const LEGEND_POSITIONS = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

export type LegendPosition = (typeof LEGEND_POSITIONS)[number]

export const LEGEND_POSITION_LABELS: Record<LegendPosition, string> = {
  top: 'Arriba',
  bottom: 'Abajo',
  left: 'Izquierda',
  right: 'Derecha',
  'top-left': 'Arriba izquierda',
  'top-right': 'Arriba derecha',
  'bottom-left': 'Abajo izquierda',
  'bottom-right': 'Abajo derecha',
}

export interface VisualConfig {
  title?: string | null
  subtitle?: string | null
  show_legend?: boolean
  legend_position?: LegendPosition
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
  line: 'Líneas',
  bar: 'Barras',
  pie: 'Pastel',
  scatter: 'Dispersión',
  candlestick: 'Velas (candlestick)',
  boxplot: 'Caja y bigotes (boxplot)',
  treemap: 'Treemap',
}
