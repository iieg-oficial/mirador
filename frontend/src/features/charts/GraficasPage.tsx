import { useState, useCallback, useEffect } from 'react'
import type { DragEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDatasets } from '@/features/datasets/api'
import { listCharts, createChart, updateChart, deleteChart, previewSpec } from './api'
import type { ChartPreviewResult } from './api'
import { ChartRenderer } from './ChartRenderer'
import { ChartTypePicker } from './ChartTypePicker'
import { SpecEditor } from './SpecEditor'
import type {
  Aggregation,
  Chart,
  ChartSpec,
  ChartType,
  FilterOperator,
  LegendPosition,
} from '@/types/charts'
import type { Dataset, ColumnMeta, SemanticType } from '@/types/datasets'
import { SEMANTIC_TYPE_LABELS } from '@/types/datasets'
import {
  AGGREGATION_LABELS,
  CHART_TYPE_LABELS,
  FILTER_OPERATOR_LABELS,
  LEGEND_POSITIONS,
  LEGEND_POSITION_LABELS,
  emptySpec,
} from '@/types/charts'

// ── Constantes ────────────────────────────────────────────────────────────────

const CHART_TYPES: ChartType[] = [
  'line',
  'bar',
  'pie',
  'scatter',
  'candlestick',
  'boxplot',
  'treemap',
  'table',
  'kpi',
]

// Zonas de mapeo por tipo de gráfica. `x/y/series` van a fieldX/fieldY/fieldSeries;
// `field` va a state.fields[fieldKey] (columnas nombradas de candlestick/boxplot).
interface ZoneDef {
  slot: 'x' | 'y' | 'series' | 'field'
  fieldKey?: string
  label: string
  hint?: string
  single?: boolean
  required?: boolean
}

const XY_ZONES: ZoneDef[] = [
  { slot: 'x', label: 'Eje X (categoría)', hint: 'Una o varias columnas', required: true },
  { slot: 'y', label: 'Eje Y (valor)', hint: 'Una o varias columnas', required: true },
  { slot: 'series', label: 'Serie (opcional)', hint: 'Sin agrupación', single: true },
]

const ZONES_BY_TYPE: Record<ChartType, ZoneDef[]> = {
  line: XY_ZONES,
  bar: XY_ZONES,
  pie: [
    { slot: 'x', label: 'Categoría', hint: 'Una o varias columnas', required: true },
    { slot: 'y', label: 'Valor', single: true, required: true },
  ],
  scatter: [
    { slot: 'x', label: 'Eje X (valor)', single: true, required: true },
    { slot: 'y', label: 'Eje Y (valor)', single: true, required: true },
  ],
  treemap: [
    { slot: 'x', label: 'Nombre', hint: 'Una o varias columnas', required: true },
    { slot: 'y', label: 'Valor', single: true, required: true },
  ],
  candlestick: [
    { slot: 'x', label: 'Categoría (eje X)', single: true, required: true },
    { slot: 'field', fieldKey: 'open', label: 'Apertura (open)', single: true, required: true },
    { slot: 'field', fieldKey: 'close', label: 'Cierre (close)', single: true, required: true },
    { slot: 'field', fieldKey: 'lowest', label: 'Mínimo (lowest)', single: true, required: true },
    { slot: 'field', fieldKey: 'highest', label: 'Máximo (highest)', single: true, required: true },
  ],
  boxplot: [
    { slot: 'x', label: 'Categoría (eje X)', single: true, required: true },
    { slot: 'field', fieldKey: 'min', label: 'Mínimo', single: true, required: true },
    { slot: 'field', fieldKey: 'q1', label: 'Q1', single: true, required: true },
    { slot: 'field', fieldKey: 'median', label: 'Mediana', single: true, required: true },
    { slot: 'field', fieldKey: 'q3', label: 'Q3', single: true, required: true },
    { slot: 'field', fieldKey: 'max', label: 'Máximo', single: true, required: true },
  ],
  table: [
    { slot: 'x', label: 'Columnas (dimensiones)', hint: 'Una o varias columnas', required: true },
    { slot: 'y', label: 'Métricas (opcional)', hint: 'Columnas numéricas' },
  ],
  kpi: [
    { slot: 'y', label: 'Métrica', single: true, required: true },
  ],
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecciona…',
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-iieg-400 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
          value ? 'bg-iieg-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// ── Esquema arrastrable + zonas de mapeo (ejes multicolumna) ───────────────────

type FieldZone = 'x' | 'y' | 'series'

const COLUMN_DRAG_TYPE = 'application/x-tablerillos-column'

// Icono/color por tipo semántico: # métrica, A dimensión, ⏱ temporal, etc.
const SEMANTIC_BADGE: Record<SemanticType, { icon: string; className: string }> = {
  metrica: { icon: '#', className: 'bg-emerald-50 text-emerald-600' },
  categorica: { icon: 'A', className: 'bg-sky-50 text-sky-600' },
  temporal: { icon: '◷', className: 'bg-amber-50 text-amber-600' },
  geografica: { icon: '⌖', className: 'bg-purple-50 text-purple-600' },
  identificador: { icon: 'ID', className: 'bg-gray-100 text-gray-500' },
  texto: { icon: 'T', className: 'bg-sky-50 text-sky-600' },
  booleano: { icon: '✓', className: 'bg-rose-50 text-rose-600' },
}

function SchemaColumnChip({
  column,
  onQuickAdd,
}: {
  column: ColumnMeta
  onQuickAdd: (zone: FieldZone) => void
}) {
  const badge = column.semantic_type ? SEMANTIC_BADGE[column.semantic_type] : null
  return (
    <div
      draggable
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData(COLUMN_DRAG_TYPE, column.name)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      title={
        column.semantic_type
          ? `${SEMANTIC_TYPE_LABELS[column.semantic_type]} · ${column.data_type}`
          : column.data_type
      }
      className="group flex cursor-grab items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs active:cursor-grabbing hover:border-iieg-300"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {badge && (
          <span
            className={`flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded px-0.5 text-[9px] font-bold ${badge.className}`}
          >
            {badge.icon}
          </span>
        )}
        <span className="truncate">
          <span className="font-medium text-gray-700">{column.label || column.name}</span>
          <span className="ml-1 text-[10px] text-gray-400">{column.data_type}</span>
        </span>
      </span>
      <span className="hidden flex-shrink-0 gap-0.5 group-hover:flex">
        <button
          type="button"
          title="Agregar a Eje X"
          onClick={() => onQuickAdd('x')}
          className="rounded px-1 text-[10px] font-semibold text-gray-400 hover:bg-iieg-50 hover:text-iieg-700"
        >
          X
        </button>
        <button
          type="button"
          title="Agregar a Eje Y"
          onClick={() => onQuickAdd('y')}
          className="rounded px-1 text-[10px] font-semibold text-gray-400 hover:bg-iieg-50 hover:text-iieg-700"
        >
          Y
        </button>
        <button
          type="button"
          title="Agregar a Serie"
          onClick={() => onQuickAdd('series')}
          className="rounded px-1 text-[10px] font-semibold text-gray-400 hover:bg-iieg-50 hover:text-iieg-700"
        >
          S
        </button>
      </span>
    </div>
  )
}

function FieldDropZone({
  label,
  hint,
  values,
  onChange,
  maxItems,
}: {
  label: string
  hint?: string
  values: string[]
  onChange: (values: string[]) => void
  maxItems?: number
}) {
  const [isOver, setIsOver] = useState(false)

  function addColumn(name: string) {
    if (!name || values.includes(name)) return
    if (maxItems && values.length >= maxItems) {
      onChange([...values.slice(values.length - maxItems + 1), name])
      return
    }
    onChange([...values, name])
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsOver(true)
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsOver(false)
          addColumn(e.dataTransfer.getData(COLUMN_DRAG_TYPE))
        }}
        className={`min-h-[40px] rounded-lg border-2 border-dashed p-1.5 transition-colors ${
          isOver ? 'border-iieg-400 bg-iieg-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        {values.length === 0 ? (
          <p className="px-0.5 py-1 text-[11px] text-gray-400">
            {hint ?? 'Arrastra una columna aquí'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {values.map((v) => (
              <span
                key={v}
                className="flex items-center gap-1 rounded-full bg-iieg-100 px-2 py-0.5 text-[11px] font-medium text-iieg-700"
              >
                {v}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="text-iieg-500 hover:text-iieg-900"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tarjeta de gráfica guardada ───────────────────────────────────────────────

function ChartCard({
  chart,
  datasets,
  onEdit,
  onDelete,
}: {
  chart: Chart
  datasets: Dataset[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dataset = datasets.find((d) => d.id === chart.dataset_id)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{chart.name}</p>
        <span className="flex-shrink-0 rounded-full bg-iieg-100 px-2 py-0.5 text-[11px] font-medium text-iieg-700">
          {CHART_TYPE_LABELS[chart.chart_type] ?? chart.chart_type}
        </span>
      </div>

      {chart.description && (
        <p className="mb-2 text-xs text-gray-500 line-clamp-2">{chart.description}</p>
      )}

      <p className="text-xs text-gray-400">
        Dataset:{' '}
        <span className="font-medium text-gray-600">{dataset?.name ?? '—'}</span>
      </p>
      <p className="mt-0.5 text-xs text-gray-400">
        Creada: {new Date(chart.created_at).toLocaleDateString('es-MX')}
      </p>

      <div className="mt-3 flex items-center gap-1.5">
        {confirmDelete ? (
          <>
            <span className="text-xs text-red-600">¿Eliminar?</span>
            <button
              onClick={onDelete}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Builder (nueva gráfica / editar) ─────────────────────────────────────────

// Filtro en edición: el valor se captura como texto y se convierte al armar
// la spec (listas separadas por coma para in/not_in/between).
interface FilterDraft {
  field: string
  operator: FilterOperator
  value: string
}

interface BuilderState {
  name: string
  description: string
  datasetId: string
  chartType: ChartType
  fieldX: string[]
  fieldY: string[]
  fieldSeries: string[]
  fields: Record<string, string>
  aggregations: Record<string, Aggregation | ''>
  filters: FilterDraft[]
  sortField: string
  sortDirection: 'asc' | 'desc'
  limit: number
  title: string
  subtitle: string
  showLegend: boolean
  legendPosition: LegendPosition
}

const BUILDER_DEFAULTS: BuilderState = {
  name: '',
  description: '',
  datasetId: '',
  chartType: 'bar',
  fieldX: [],
  fieldY: [],
  fieldSeries: [],
  fields: {},
  aggregations: {},
  filters: [],
  sortField: '',
  sortDirection: 'asc',
  limit: 1000,
  title: '',
  subtitle: '',
  showLegend: true,
  legendPosition: 'top',
}

// Vuelca una spec al estado del builder visual (best-effort: encodings de
// tooltip/size u ordenamientos múltiples del modo avanzado no tienen control
// visual y se conservan solo mientras se edita en JSON).
function stateFromSpec(spec: ChartSpec, name: string, description: string): BuilderState {
  const aggregations: Record<string, Aggregation | ''> = {}
  for (const e of spec.encodings.y) {
    if (e.aggregation) aggregations[e.field] = e.aggregation
  }
  return {
    name,
    description,
    datasetId: spec.data.dataset_id,
    chartType: spec.visual.chart_type,
    fieldX: spec.encodings.x.map((e) => e.field),
    fieldY: spec.encodings.y.map((e) => e.field),
    fieldSeries: spec.encodings.color ? [spec.encodings.color.field] : [],
    fields: spec.encodings.fields ?? {},
    aggregations,
    filters: spec.data.filters.map((f) => ({
      field: f.field,
      operator: f.operator,
      value: Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? ''),
    })),
    sortField: spec.data.sort[0]?.field ?? '',
    sortDirection: spec.data.sort[0]?.direction ?? 'asc',
    limit: spec.data.limit,
    title: spec.visual.title ?? '',
    subtitle: spec.visual.subtitle ?? '',
    showLegend: spec.interactions.legend,
    legendPosition: spec.style.legend_position,
  }
}

function builderFromChart(chart: Chart): BuilderState {
  return stateFromSpec(chart.chart_spec, chart.name, chart.description ?? '')
}

// Convierte el valor de texto de un filtro al tipo que espera el backend.
function filterValue(draft: FilterDraft, columns: ColumnMeta[]): unknown {
  if (draft.operator === 'is_null' || draft.operator === 'is_not_null') return undefined
  const col = columns.find((c) => c.name === draft.field)
  const numeric = col?.is_metric || col?.semantic_type === 'metrica'
  const scalar = (s: string): unknown => {
    const t = s.trim()
    if (numeric && t !== '' && !Number.isNaN(Number(t))) return Number(t)
    return t
  }
  if (draft.operator === 'in' || draft.operator === 'not_in' || draft.operator === 'between') {
    return draft.value.split(',').map((s) => scalar(s))
  }
  return scalar(draft.value)
}

// Construye la ChartSpec canónica desde el estado del builder visual.
function specFromState(state: BuilderState, columns: ColumnMeta[]): ChartSpec {
  const spec = emptySpec(state.datasetId, state.chartType)
  spec.visual.title = state.title || null
  spec.visual.subtitle = state.subtitle || null
  spec.encodings.x = state.fieldX.map((field) => ({ field }))
  spec.encodings.y = state.fieldY.map((field) => ({
    field,
    aggregation: state.aggregations[field] || null,
  }))
  spec.encodings.color = state.fieldSeries[0] ? { field: state.fieldSeries[0] } : null
  spec.encodings.fields = state.fields
  spec.data.filters = state.filters
    .filter((f) => f.field)
    .map((f) => ({ field: f.field, operator: f.operator, value: filterValue(f, columns) }))
  spec.data.sort = state.sortField
    ? [{ field: state.sortField, direction: state.sortDirection }]
    : []
  spec.data.limit = state.limit
  spec.interactions.legend = state.showLegend
  spec.style.legend_position = state.legendPosition
  return spec
}

function ChartBuilder({
  editingChart,
  initialChartType,
  datasets,
  onSaved,
  onCancel,
}: {
  editingChart: Chart | null
  initialChartType: ChartType
  datasets: Dataset[]
  onSaved: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [state, setState] = useState<BuilderState>(
    editingChart
      ? builderFromChart(editingChart)
      : { ...BUILDER_DEFAULTS, chartType: initialChartType },
  )
  const [previewData, setPreviewData] = useState<ChartPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Modo avanzado (RF-04): edición directa de la ChartSpec en JSON.
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [advancedSpec, setAdvancedSpec] = useState<ChartSpec | null>(null)

  const set = useCallback(
    <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const selectedDataset = datasets.find((d) => d.id === state.datasetId) ?? null
  // El esquema del dataset ya validado viene en columns_schema (sin necesidad
  // de correr la vista previa); si aún no está validado, se usa lo último
  // que haya devuelto el preview como respaldo.
  const schemaColumns: ColumnMeta[] =
    selectedDataset?.columns_schema?.columns ?? previewData?.columns ?? []

  const zones = ZONES_BY_TYPE[state.chartType]

  const zoneValues = (z: ZoneDef): string[] => {
    if (z.slot === 'x') return state.fieldX
    if (z.slot === 'y') return state.fieldY
    if (z.slot === 'series') return state.fieldSeries
    const v = state.fields[z.fieldKey!]
    return v ? [v] : []
  }

  const setZoneValues = (z: ZoneDef, values: string[]) => {
    if (z.slot === 'x') return set('fieldX', values)
    if (z.slot === 'y') return set('fieldY', values)
    if (z.slot === 'series') return set('fieldSeries', values)
    setState((prev) => {
      const next = { ...prev.fields }
      if (values[0]) next[z.fieldKey!] = values[0]
      else delete next[z.fieldKey!]
      return { ...prev, fields: next }
    })
  }

  const requiredFilled = zones.every((z) => !z.required || zoneValues(z).length > 0)
  const canSave = Boolean(
    state.name.trim() && state.datasetId && state.chartType && requiredFilled,
  )

  // Al cambiar de tipo, conserva solo las zonas que el nuevo tipo usa (evita
  // mapeos huérfanos que el backend rechazaría o el render ignoraría).
  function changeChartType(next: ChartType) {
    const z = ZONES_BY_TYPE[next]
    const usesX = z.some((zz) => zz.slot === 'x')
    const usesY = z.some((zz) => zz.slot === 'y')
    const usesSeries = z.some((zz) => zz.slot === 'series')
    const keepFields = new Set(z.filter((zz) => zz.slot === 'field').map((zz) => zz.fieldKey))
    setState((prev) => ({
      ...prev,
      chartType: next,
      fieldX: usesX ? prev.fieldX : [],
      fieldY: usesY ? prev.fieldY : [],
      fieldSeries: usesSeries ? prev.fieldSeries : [],
      fields: Object.fromEntries(Object.entries(prev.fields).filter(([k]) => keepFields.has(k))),
    }))
  }

  function addToZone(zone: FieldZone, column: string) {
    if (zone === 'series') {
      set('fieldSeries', [column])
      return
    }
    const key = zone === 'x' ? 'fieldX' : 'fieldY'
    if (state[key].includes(column)) return
    set(key, [...state[key], column])
  }

  // Spec efectiva: la del editor JSON cuando el modo avanzado está activo y
  // el JSON parsea; si no, la derivada del builder visual.
  const currentSpec = specFromState(state, schemaColumns)
  const effectiveSpec = mode === 'json' && advancedSpec ? advancedSpec : currentSpec

  // Preview por spec: el backend genera la consulta segura (agregación,
  // filtros y orden server-side) y devuelve solo las filas necesarias.
  async function runPreview() {
    if (mode === 'visual' && (!state.datasetId || !requiredFilled)) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await previewSpec(effectiveSpec)
      setPreviewData(result)
    } catch (err) {
      setPreviewError((err as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Cambio de modo: al volver al visual se sincroniza lo representable de la
  // spec avanzada con los controles del builder.
  function switchMode(next: 'visual' | 'json') {
    if (next === mode) return
    if (next === 'visual' && advancedSpec) {
      setState(stateFromSpec(advancedSpec, state.name, state.description))
    }
    setAdvancedSpec(null)
    setMode(next)
  }

  // Al editar una gráfica guardada ya hay un dataset seleccionado: disparar el
  // preview de una vez para que la gráfica se renderice sin que el usuario
  // tenga que pulsar "Actualizar vista" a ciegas (REVISION_CODIGO.md #12).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editingChart && state.datasetId) runPreview()
  }, [])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'json' && !advancedSpec) {
        throw new Error('El JSON de la spec es inválido; corrígelo antes de guardar.')
      }
      const chartSpec = effectiveSpec
      if (editingChart) {
        return updateChart(editingChart.id, {
          name: state.name,
          description: state.description || null,
          chart_spec: chartSpec,
        })
      }
      return createChart({
        name: state.name,
        description: state.description || null,
        chart_spec: chartSpec,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charts'] })
      onSaved()
    },
    onError: (err) => setSaveError((err as Error).message),
  })

  const referencedCols = zones.flatMap((z) => zoneValues(z))
  const showChart =
    previewData &&
    previewData.rows.length > 0 &&
    (mode === 'json' ||
      (requiredFilled &&
        referencedCols.every((c) => previewData.columns.some((col) => col.name === c))))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Config row */}
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-1 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              Nombre<span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nombre de la gráfica"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
            />
          </div>
          <div className="col-span-1 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Descripción</label>
            <input
              type="text"
              value={state.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descripción opcional"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
            />
          </div>
          <Select
            label="Dataset"
            required
            value={state.datasetId}
            onChange={(v) => {
              set('datasetId', v)
              setPreviewData(null)
              set('fieldX', [])
              set('fieldY', [])
              set('fieldSeries', [])
              set('fields', {})
            }}
            options={datasets.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            label="Tipo de visualización"
            required
            value={state.chartType}
            onChange={(v) => changeChartType(v as ChartType)}
            options={CHART_TYPES.map((t) => ({ value: t, label: CHART_TYPE_LABELS[t] }))}
          />
        </div>
      </div>

      {/* Toggle de modo: visual / avanzado (JSON) */}
      <div className="flex items-center gap-1 border-b border-gray-100 bg-white px-6 py-1.5">
        <button
          type="button"
          onClick={() => switchMode('visual')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'visual' ? 'bg-iieg-100 text-iieg-700' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          Modo visual
        </button>
        <button
          type="button"
          onClick={() => switchMode('json')}
          className={`rounded-lg px-3 py-1 text-xs font-medium ${
            mode === 'json' ? 'bg-iieg-100 text-iieg-700' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          Avanzado (JSON)
        </button>
        {mode === 'json' && (
          <span className="ml-2 text-[11px] text-gray-400">
            Edita la ChartSpec directamente; sin SQL ni JavaScript libres.
          </span>
        )}
      </div>

      {/* Main: 3 columnas (visual) o editor + preview (avanzado) */}
      <div className="flex flex-1 overflow-hidden">
        {mode === 'json' && (
          <div className="w-1/2 flex-shrink-0 border-r border-gray-100 bg-white">
            <SpecEditor
              initial={currentSpec}
              onSpecChange={setAdvancedSpec}
              generatedSql={previewData?.generated_sql ?? null}
              previewRows={previewData?.rows ?? null}
            />
          </div>
        )}

        {/* Izquierda: esquema del dataset + mapeo de campos (drag & drop) */}
        {mode === 'visual' && (
        <div className="w-64 flex-shrink-0 space-y-4 overflow-y-auto border-r border-gray-100 bg-white p-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              Esquema del dataset
            </p>

            {!state.datasetId && (
              <p className="text-xs text-gray-400">Selecciona un dataset para ver su esquema.</p>
            )}

            {state.datasetId && schemaColumns.length === 0 && (
              <p className="text-xs text-gray-400">
                Este dataset no tiene un esquema validado. Valídalo en el módulo de
                Datasets, o usa "Actualizar vista" para detectar columnas desde el preview.
              </p>
            )}

            {schemaColumns.length > 0 && (
              <div className="space-y-1">
                {schemaColumns.map((c) => (
                  <SchemaColumnChip key={c.name} column={c} onQuickAdd={(zone) => addToZone(zone, c.name)} />
                ))}
              </div>
            )}

            {selectedDataset && (
              <div className="mt-3 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-500">
                <p className="font-semibold text-gray-700">{selectedDataset.name}</p>
                <p className="mt-0.5">{selectedDataset.max_rows} filas máx.</p>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Mapeo de campos
            </p>
            <p className="text-[11px] text-gray-400">
              Arrastra columnas del esquema (o usa los botones X/Y/S al pasar el cursor).
            </p>

            {zones.map((z) => (
              <FieldDropZone
                key={z.slot === 'field' ? `field:${z.fieldKey}` : z.slot}
                label={z.required ? `${z.label} *` : z.label}
                hint={z.hint}
                values={zoneValues(z)}
                onChange={(v) => setZoneValues(z, v)}
                maxItems={z.single ? 1 : undefined}
              />
            ))}
            {(state.chartType === 'bar' || state.chartType === 'line') &&
              state.fieldY.length > 1 && (
                <p className="text-[11px] text-gray-400">
                  Varias columnas en Eje Y se grafican como series separadas.
                </p>
              )}
          </div>
        </div>
        )}

        {/* Centro: vista previa */}
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
          <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-700">Vista previa</p>
            <button
              onClick={runPreview}
              disabled={!state.datasetId || previewLoading}
              className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
            >
              {previewLoading ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0" />
                  </svg>
                  Cargando…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar vista
                </>
              )}
            </button>
          </div>

          <div className="flex-1 p-4">
            {previewError && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{previewError}</div>
            )}

            {!previewError && showChart && (
              <div className="h-full min-h-[300px] rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <ChartRenderer spec={effectiveSpec} rows={previewData!.rows} />
              </div>
            )}

            {!previewError && !showChart && !previewLoading && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg
                    className="mx-auto mb-3 h-12 w-12 text-gray-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                    />
                  </svg>
                  <p className="text-sm text-gray-400">
                    {!state.datasetId
                      ? 'Selecciona un dataset para comenzar'
                      : state.fieldX.length === 0 || state.fieldY.length === 0
                      ? 'Arrastra los campos a Eje X e Y y haz clic en "Actualizar vista"'
                      : 'Haz clic en "Actualizar vista" para cargar los datos'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {previewData && (
            <div className="border-t border-gray-100 bg-white px-4 py-2 text-xs text-gray-400">
              {previewData.total_rows ?? previewData.rows.length} filas
              {previewData.truncated && ' (truncado)'}
              {' · '}
              {previewData.elapsed_ms.toFixed(0)} ms
              {' · '}
              {previewData.columns.length} columnas
            </div>
          )}
        </div>

        {/* Derecha: config visual (solo en modo visual) */}
        {mode === 'visual' && (
        <div className="w-56 flex-shrink-0 space-y-4 overflow-y-auto border-l border-gray-100 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Configuración visual
          </p>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Título</label>
            <input
              type="text"
              value={state.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Título de la gráfica"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Subtítulo</label>
            <input
              type="text"
              value={state.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
              placeholder="Subtítulo opcional"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
            />
          </div>

          <Toggle
            label="Mostrar leyenda"
            value={state.showLegend}
            onChange={(v) => set('showLegend', v)}
          />

          {state.showLegend && (
            <Select
              label="Posición de la leyenda"
              value={state.legendPosition}
              onChange={(v) => set('legendPosition', v as LegendPosition)}
              options={LEGEND_POSITIONS.map((p) => ({ value: p, label: LEGEND_POSITION_LABELS[p] }))}
            />
          )}

          {/* Agregaciones por métrica (según la metadata semántica del dataset) */}
          {state.fieldY.length > 0 && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Agregaciones
              </p>
              {state.fieldY.map((field) => {
                const col = schemaColumns.find((c) => c.name === field)
                const allowed = (col?.aggregations ??
                  Object.keys(AGGREGATION_LABELS)) as Aggregation[]
                return (
                  <Select
                    key={field}
                    label={field}
                    value={state.aggregations[field] ?? ''}
                    onChange={(v) =>
                      setState((prev) => ({
                        ...prev,
                        aggregations: { ...prev.aggregations, [field]: v as Aggregation | '' },
                      }))
                    }
                    placeholder="Sin agregar"
                    options={allowed.map((a) => ({ value: a, label: AGGREGATION_LABELS[a] }))}
                  />
                )
              })}
            </div>
          )}

          {/* Filtros */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Filtros</p>
              <button
                type="button"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    filters: [...prev.filters, { field: '', operator: '=', value: '' }],
                  }))
                }
                className="rounded px-1.5 py-0.5 text-xs font-semibold text-iieg-600 hover:bg-iieg-50"
              >
                + Agregar
              </button>
            </div>
            {state.filters.map((f, i) => {
              const setFilter = (patch: Partial<FilterDraft>) =>
                setState((prev) => ({
                  ...prev,
                  filters: prev.filters.map((ff, j) => (j === i ? { ...ff, ...patch } : ff)),
                }))
              const noValue = f.operator === 'is_null' || f.operator === 'is_not_null'
              const listValue =
                f.operator === 'in' || f.operator === 'not_in' || f.operator === 'between'
              return (
                <div key={i} className="space-y-1 rounded-lg border border-gray-100 p-2">
                  <div className="flex items-center gap-1">
                    <select
                      value={f.field}
                      onChange={(e) => setFilter({ field: e.target.value })}
                      className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs"
                    >
                      <option value="">Campo…</option>
                      {schemaColumns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          filters: prev.filters.filter((_, j) => j !== i),
                        }))
                      }
                      className="flex-shrink-0 rounded px-1 text-gray-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                  <select
                    value={f.operator}
                    onChange={(e) => setFilter({ operator: e.target.value as FilterOperator })}
                    className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
                  >
                    {(Object.keys(FILTER_OPERATOR_LABELS) as FilterOperator[]).map((op) => (
                      <option key={op} value={op}>
                        {FILTER_OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </select>
                  {!noValue && (
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => setFilter({ value: e.target.value })}
                      placeholder={listValue ? 'Valores separados por coma' : 'Valor'}
                      className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Orden y límite */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Orden y límite
            </p>
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <Select
                  label="Ordenar por"
                  value={state.sortField}
                  onChange={(v) => set('sortField', v)}
                  placeholder="Sin orden"
                  options={schemaColumns.map((c) => ({ value: c.name, label: c.name }))}
                />
              </div>
              {state.sortField && (
                <button
                  type="button"
                  title={state.sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
                  onClick={() =>
                    set('sortDirection', state.sortDirection === 'asc' ? 'desc' : 'asc')
                  }
                  className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {state.sortDirection === 'asc' ? '↑' : '↓'}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Límite de filas</label>
              <input
                type="number"
                min={1}
                max={50000}
                value={state.limit}
                onChange={(e) => set('limit', Math.max(1, Number(e.target.value) || 1))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-white px-6 py-3">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <div className="flex items-center gap-3">
          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
          >
            {saveMutation.isPending ? 'Guardando…' : editingChart ? 'Actualizar gráfica' : 'Guardar gráfica'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = 'list' | 'picker' | 'builder'

export function GraficasPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('list')
  const [editingChart, setEditingChart] = useState<Chart | null>(null)
  const [pickerType, setPickerType] = useState<ChartType | null>(null)

  const { data: charts = [], isLoading: loadingCharts } = useQuery({
    queryKey: ['charts'],
    queryFn: listCharts,
  })

  const { data: datasets = [] } = useQuery({
    queryKey: ['datasets'],
    queryFn: listDatasets,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChart,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charts'] }),
  })

  function openPicker() {
    setEditingChart(null)
    setPickerType(null)
    setTab('picker')
  }

  function openBuilder(chart?: Chart) {
    setEditingChart(chart ?? null)
    setTab('builder')
  }

  function closeAll() {
    setEditingChart(null)
    setPickerType(null)
    setTab('list')
  }

  // Tab label para la pestaña activa (picker o builder)
  const creatorLabel = editingChart
    ? `Editar: ${editingChart.name}`
    : tab === 'picker'
    ? 'Nueva gráfica'
    : pickerType
    ? `Nueva gráfica`
    : 'Nueva gráfica'

  const inCreator = tab === 'picker' || tab === 'builder'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Gráficas</h1>
          <p className="text-sm text-gray-500">Crea y gestiona visualizaciones a partir de tus datasets.</p>
        </div>
        {tab === 'list' && (
          <button
            onClick={openPicker}
            className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva gráfica
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-100 bg-white px-6">
        <button
          onClick={closeAll}
          className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
            tab === 'list'
              ? 'border-iieg-600 text-iieg-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Mis gráficas
        </button>
        {inCreator && (
          <button
            className="border-b-2 border-iieg-600 pb-3 pt-3 text-sm font-medium text-iieg-700"
          >
            {creatorLabel}
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-hidden">
        {tab === 'list' && (
          <div className="h-full overflow-y-auto p-6">
            {loadingCharts && (
              <p className="text-sm text-gray-400">Cargando gráficas…</p>
            )}

            {!loadingCharts && charts.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                <svg className="h-12 w-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-500">Sin gráficas</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Crea una gráfica a partir de un dataset para comenzar
                  </p>
                </div>
                <button
                  onClick={openPicker}
                  className="mt-2 rounded-lg border border-iieg-300 px-3 py-1.5 text-xs font-medium text-iieg-700 hover:bg-iieg-50"
                >
                  Nueva gráfica
                </button>
              </div>
            )}

            {charts.length > 0 && (
              <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
                {charts.map((chart) => (
                  <ChartCard
                    key={chart.id}
                    chart={chart}
                    datasets={datasets}
                    onEdit={() => openBuilder(chart)}
                    onDelete={() => deleteMutation.mutate(chart.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'picker' && (
          <ChartTypePicker
            selected={pickerType}
            onSelect={setPickerType}
            onConfirm={() => {
              if (pickerType) openBuilder()
            }}
            onCancel={closeAll}
          />
        )}

        {tab === 'builder' && (
          <ChartBuilder
            editingChart={editingChart}
            initialChartType={editingChart ? editingChart.chart_type : (pickerType ?? 'bar')}
            datasets={datasets}
            onSaved={closeAll}
            onCancel={closeAll}
          />
        )}
      </div>
    </div>
  )
}
