import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { ChartType } from '@/types/charts'

// ── Paleta IIEG ───────────────────────────────────────────────────────────────

const C = ['#7c3aed', '#9a52ba', '#c084fc', '#f97316', '#fb923c', '#4ade80']

// ── Opciones de muestra por tipo ──────────────────────────────────────────────

// table/kpi no son ECharts: sus tarjetas usan un preview estático (abajo).
const SAMPLE_OPTIONS: Partial<Record<ChartType, EChartsOption>> = {
  line: {
    animation: false,
    color: [C[0]],
    grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: { type: 'category', data: ['E', 'F', 'M', 'A', 'M', 'J', 'J'], show: false },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      data: [32, 48, 41, 67, 58, 80, 72],
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2.5 },
    }],
  },

  bar: {
    animation: false,
    color: [C[0]],
    grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: { type: 'category', data: ['Ene', 'Feb', 'Mar', 'Abr', 'May'], show: false },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'bar',
      data: [45, 78, 32, 91, 56],
      barMaxWidth: 22,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    }],
  },

  pie: {
    animation: false,
    color: C,
    series: [{
      type: 'pie',
      radius: '72%',
      center: ['50%', '50%'],
      data: [
        { value: 38, name: 'A' },
        { value: 26, name: 'B' },
        { value: 21, name: 'C' },
        { value: 15, name: 'D' },
      ],
      label: { show: false },
      itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 2 },
    }],
  },

  scatter: {
    animation: false,
    color: [C[0]],
    grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'scatter',
      symbolSize: 7,
      data: [
        [10, 45], [25, 78], [35, 32], [50, 91], [65, 56],
        [30, 67], [45, 23], [60, 84], [20, 55], [40, 72],
        [55, 38], [15, 62], [70, 48], [38, 88], [52, 30],
      ],
    }],
  },

  candlestick: {
    animation: false,
    grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: { type: 'category', data: ['1', '2', '3', '4', '5'], show: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'candlestick',
      itemStyle: { color: C[5], color0: C[3], borderColor: C[5], borderColor0: C[3] },
      // [open, close, lowest, highest]
      data: [[20, 34, 18, 36], [34, 28, 26, 40], [28, 40, 25, 42], [40, 38, 33, 45], [38, 48, 36, 50]],
    }],
  },

  boxplot: {
    animation: false,
    color: [C[0]],
    grid: { top: 8, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'], show: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'boxplot',
      // [min, Q1, mediana, Q3, max]
      data: [[10, 18, 25, 32, 40], [12, 20, 28, 35, 44], [8, 15, 22, 30, 38], [14, 22, 30, 38, 48]],
    }],
  },

  treemap: {
    animation: false,
    color: C,
    series: [{
      type: 'treemap',
      roam: false,
      breadcrumb: { show: false },
      label: { show: false },
      data: [
        { name: 'A', value: 40 },
        { name: 'B', value: 26 },
        { name: 'C', value: 20 },
        { name: 'D', value: 14 },
      ],
    }],
  },
}

// ── Descripciones ─────────────────────────────────────────────────────────────

const CHART_META: {
  type: ChartType
  label: string
  description: string
  usoClave: string
}[] = [
  {
    type: 'line',
    label: 'Líneas',
    description: 'Muestra tendencias a lo largo del tiempo',
    usoClave: 'Series temporales, evolución de indicadores',
  },
  {
    type: 'bar',
    label: 'Barras',
    description: 'Compara valores entre categorías',
    usoClave: 'Rankings, comparativos puntuales',
  },
  {
    type: 'pie',
    label: 'Pastel',
    description: 'Proporciones de un total',
    usoClave: 'Participación porcentual (máx. 6–7 categorías)',
  },
  {
    type: 'scatter',
    label: 'Dispersión',
    description: 'Relación entre dos variables numéricas',
    usoClave: 'Correlaciones, detección de outliers',
  },
  {
    type: 'candlestick',
    label: 'Velas (candlestick)',
    description: 'Apertura, cierre, mínimo y máximo por periodo',
    usoClave: 'Series financieras, rangos de valores',
  },
  {
    type: 'boxplot',
    label: 'Caja y bigotes (boxplot)',
    description: 'Distribución por cuartiles (min, Q1, mediana, Q3, max)',
    usoClave: 'Dispersión y valores atípicos por categoría',
  },
  {
    type: 'treemap',
    label: 'Treemap',
    description: 'Proporciones como rectángulos anidados',
    usoClave: 'Participación de muchas categorías en un total',
  },
  {
    type: 'table',
    label: 'Tabla',
    description: 'Datos tabulares con varias dimensiones y métricas',
    usoClave: 'Detalle de registros, exploración de datos',
  },
  {
    type: 'kpi',
    label: 'Tarjeta KPI',
    description: 'Un indicador agregado en grande',
    usoClave: 'Totales, promedios, valores clave',
  },
]

// ── Previews estáticos para tipos que no son ECharts ──────────────────────────

function StaticPreview({ type }: { type: ChartType }) {
  if (type === 'kpi') {
    return (
      <div className="flex h-28 w-full flex-col items-center justify-center">
        <span className="text-2xl font-bold text-iieg-700">8.4M</span>
        <span className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">
          Población total
        </span>
      </div>
    )
  }
  // Tabla: filas simuladas.
  return (
    <div className="flex h-28 w-full flex-col justify-center gap-1 px-2">
      <div className="flex gap-1">
        <div className="h-3 flex-1 rounded-sm bg-iieg-200" />
        <div className="h-3 w-10 rounded-sm bg-iieg-200" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-1">
          <div className="h-2.5 flex-1 rounded-sm bg-gray-100" />
          <div className="h-2.5 w-10 rounded-sm bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

// ── Mini preview con ECharts ──────────────────────────────────────────────────

function MiniChart({ option }: { option: EChartsOption }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chart.setOption(option)
    return () => chart.dispose()
  }, [option])

  return <div ref={ref} className="h-28 w-full" />
}

// ── Tarjeta de tipo ───────────────────────────────────────────────────────────

function ChartTypeCard({
  meta,
  selected,
  onClick,
}: {
  meta: (typeof CHART_META)[number]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all ${
        selected
          ? 'border-iieg-500 bg-iieg-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-iieg-300 hover:shadow-sm'
      }`}
    >
      {/* Mini chart */}
      <div
        className={`relative border-b px-3 pt-3 pb-1 transition-colors ${
          selected ? 'border-iieg-200 bg-iieg-50' : 'border-gray-100 bg-gray-50 group-hover:bg-gray-50'
        }`}
      >
        {SAMPLE_OPTIONS[meta.type] ? (
          <MiniChart option={SAMPLE_OPTIONS[meta.type]!} />
        ) : (
          <StaticPreview type={meta.type} />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className={`text-sm font-semibold ${selected ? 'text-iieg-800' : 'text-gray-800'}`}>
          {meta.label}
        </p>
        <p className="text-xs text-gray-500">{meta.description}</p>
        <p className={`mt-auto pt-1.5 text-[11px] ${selected ? 'text-iieg-600' : 'text-gray-400'}`}>
          {meta.usoClave}
        </p>
      </div>

      {/* Check seleccionado */}
      {selected && (
        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-iieg-600">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ── Picker principal ──────────────────────────────────────────────────────────

interface ChartTypePickerProps {
  selected: ChartType | null
  onSelect: (type: ChartType) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ChartTypePicker({ selected, onSelect, onConfirm, onCancel }: ChartTypePickerProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Encabezado */}
      <div className="border-b border-gray-100 bg-white px-6 py-5">
        <h2 className="text-base font-bold text-gray-900">Elige el tipo de visualización</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Selecciona el tipo de gráfica que mejor representa tus datos. Puedes cambiarla después desde el editor.
        </p>
      </div>

      {/* Grid de tipos */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="relative grid grid-cols-4 gap-4">
          {CHART_META.map((meta) => (
            <ChartTypeCard
              key={meta.type}
              meta={meta}
              selected={selected === meta.type}
              onClick={() => onSelect(meta.type)}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-white px-6 py-3">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={!selected}
          className="flex items-center gap-2 rounded-lg bg-iieg-700 px-5 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
        >
          Continuar
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
