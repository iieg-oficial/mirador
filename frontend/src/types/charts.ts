// Tipos del módulo de gráficas. El formato canónico es la ChartSpec 1.0
// (espejo del esquema Pydantic del backend en charts/spec.py): describe qué
// datos usa la gráfica y cómo se visualiza, independiente del renderer.

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'candlestick'
  | 'boxplot'
  | 'treemap'
  | 'table'
  | 'kpi'

export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'

export type CodeEngine = 'echarts' | 'plotly'

export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not_in'
  | 'contains'
  | 'between'
  | 'is_null'
  | 'is_not_null'

export interface Encoding {
  field: string
  aggregation?: Aggregation | null
  label?: string | null
}

export interface FilterSpec {
  field: string
  operator: FilterOperator
  value?: unknown
}

export interface SortSpec {
  field: string
  direction: 'asc' | 'desc'
}

export interface DataSpec {
  dataset_id: string
  filters: FilterSpec[]
  sort: SortSpec[]
  limit: number
}

export interface VisualSpec {
  chart_type: ChartType
  title?: string | null
  subtitle?: string | null
}

// `fields` lleva columnas nombradas para los tipos con forma especial:
// candlestick (open/close/lowest/highest) y boxplot (min/q1/median/q3/max).
export interface EncodingsSpec {
  x: Encoding[]
  y: Encoding[]
  color?: Encoding | null
  size?: Encoding | null
  tooltip: Encoding[]
  fields: Record<string, string>
}

export interface InteractionsSpec {
  tooltip: boolean
  legend: boolean
  zoom: boolean
  download: boolean
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

export interface StyleSpec {
  theme: 'institutional' | 'default'
  show_labels: boolean
  orientation: 'vertical' | 'horizontal'
  legend_position: LegendPosition
}

// Overrides controlados sobre el EChartsOption generado (Fase 5): solo las
// secciones de la whitelist del backend (legend/tooltip/grid), JSON puro.
export interface OverridesSpec {
  legend?: Record<string, unknown>
  tooltip?: Record<string, unknown>
  grid?: Record<string, unknown>
}

export interface ChartSpec {
  version: '1.0'
  data: DataSpec
  visual: VisualSpec
  encodings: EncodingsSpec
  interactions: InteractionsSpec
  style: StyleSpec
  overrides?: OverridesSpec | null
  // Gráfica "de código": se ejecuta para armar la visualización a partir de las
  // filas del dataset. Si está presente, gana sobre encodings/chart_type.
  code?: string | null
  // Motor del código: 'echarts' = JS en el navegador; 'plotly' = Python (Pyodide).
  code_engine?: CodeEngine
}

/** Spec vacía con los mismos defaults que el backend. */
export function emptySpec(datasetId: string, chartType: ChartType): ChartSpec {
  return {
    version: '1.0',
    data: { dataset_id: datasetId, filters: [], sort: [], limit: 1000 },
    visual: { chart_type: chartType, title: null, subtitle: null },
    encodings: { x: [], y: [], color: null, size: null, tooltip: [], fields: {} },
    interactions: { tooltip: true, legend: true, zoom: false, download: false },
    style: {
      theme: 'institutional',
      show_labels: false,
      orientation: 'vertical',
      legend_position: 'top',
    },
  }
}

// ── Recursos persistidos ───────────────────────────────────────────────────────

export type ChartStatus = 'draft' | 'in_review' | 'approved' | 'archived'

export const CHART_STATUS_LABELS: Record<ChartStatus, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobada',
  archived: 'Archivada',
}

export interface Chart {
  id: string
  dataset_id: string
  name: string
  description: string | null
  renderer: string
  chart_type: ChartType
  chart_spec: ChartSpec
  status: ChartStatus
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface ChartCreate {
  name: string
  description?: string | null
  chart_spec: ChartSpec
}

export interface ChartUpdate {
  name?: string
  description?: string | null
  chart_spec?: ChartSpec
  change_comment?: string | null
  status?: ChartStatus
}

export interface ChartVersion {
  id: string
  chart_id: string
  version_number: number
  chart_spec: ChartSpec
  change_comment: string | null
  created_by: string | null
  created_by_email: string | null
  created_at: string
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: 'Líneas',
  bar: 'Barras',
  pie: 'Pastel',
  scatter: 'Dispersión',
  candlestick: 'Velas (candlestick)',
  boxplot: 'Caja y bigotes (boxplot)',
  treemap: 'Treemap',
  table: 'Tabla',
  kpi: 'Tarjeta KPI',
}

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: 'Suma',
  avg: 'Promedio',
  min: 'Mínimo',
  max: 'Máximo',
  count: 'Conteo',
  count_distinct: 'Conteo distinto',
}

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  '=': 'Igual a',
  '!=': 'Distinto de',
  '>': 'Mayor que',
  '>=': 'Mayor o igual',
  '<': 'Menor que',
  '<=': 'Menor o igual',
  in: 'En lista',
  not_in: 'Fuera de lista',
  contains: 'Contiene',
  between: 'Entre',
  is_null: 'Es nulo',
  is_not_null: 'No es nulo',
}
