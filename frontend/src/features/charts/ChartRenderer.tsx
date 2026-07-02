import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { ChartType, FieldMapping, LegendPosition, VisualConfig } from '@/types/charts'

// ── Posición de leyenda → opción ECharts ───────────────────────────────────────

function legendPositionOption(pos: LegendPosition): EChartsOption['legend'] {
  switch (pos) {
    case 'top':
      return { top: 4, left: 'center', orient: 'horizontal' }
    case 'bottom':
      return { bottom: 4, left: 'center', orient: 'horizontal' }
    case 'left':
      return { left: 4, top: 'middle', orient: 'vertical' }
    case 'right':
      return { right: 4, top: 'middle', orient: 'vertical' }
    case 'top-left':
      return { top: 4, left: 4, orient: 'vertical' }
    case 'top-right':
      return { top: 4, right: 4, orient: 'vertical' }
    case 'bottom-left':
      return { bottom: 4, left: 4, orient: 'vertical' }
    case 'bottom-right':
      return { bottom: 4, right: 4, orient: 'vertical' }
  }
}

// ── Composición de categoría cuando el eje tiene varias columnas ──────────────

function compositeValue(cols: string[], row: Record<string, unknown>): string {
  if (cols.length <= 1) return String(row[cols[0]] ?? '')
  return cols.map((c) => String(row[c] ?? '')).join(' / ')
}

function numericValue(v: unknown): number {
  return typeof v === 'number' ? v : Number(v)
}

// ── Transformador spec → ECharts option ───────────────────────────────────────

function buildOption(
  chartType: ChartType,
  fieldMapping: FieldMapping,
  visualConfig: VisualConfig,
  rows: Record<string, unknown>[],
): EChartsOption {
  const { x, y, series, fields = {} } = fieldMapping
  const x0 = x[0] ?? ''
  const y0 = y[0] ?? ''
  const {
    title,
    subtitle,
    show_legend = true,
    legend_position = 'top',
  } = visualConfig

  const baseTitle: EChartsOption['title'] = {
    text: title ?? '',
    subtext: subtitle ?? '',
    left: 'left',
    textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
    subtextStyle: { fontSize: 12, color: '#6b7280' },
  }

  const legendOpt: EChartsOption['legend'] = show_legend
    ? { show: true, ...legendPositionOption(legend_position) }
    : { show: false }

  const categoryAxis = {
    type: 'category' as const,
    data: rows.map((r) => compositeValue(x, r)),
    axisLabel: { overflow: 'truncate' as const, width: 80 },
  }
  const gridOpt = { containLabel: true, left: 16, right: 16, top: title ? 56 : 16, bottom: 16 }

  // ── Pastel ─────────────────────────────────────────────────────────────────
  if (chartType === 'pie') {
    return {
      title: baseTitle,
      legend: legendOpt,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: '65%',
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{d}%' },
          data: rows.map((r) => ({ name: compositeValue(x, r), value: numericValue(r[y0]) })),
        },
      ],
    }
  }

  // ── Treemap ─────────────────────────────────────────────────────────────────
  if (chartType === 'treemap') {
    return {
      title: baseTitle,
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      series: [
        {
          type: 'treemap',
          roam: false,
          breadcrumb: { show: false },
          label: { show: true, formatter: '{b}' },
          data: rows.map((r) => ({ name: compositeValue(x, r), value: numericValue(r[y0]) })),
        },
      ],
    }
  }

  // ── Dispersión ─────────────────────────────────────────────────────────────
  if (chartType === 'scatter') {
    return {
      title: baseTitle,
      legend: legendOpt,
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: x0 },
      yAxis: { type: 'value', name: y0 },
      series: [
        {
          type: 'scatter',
          data: rows.map((r) => [numericValue(r[x0]), numericValue(r[y0])]),
          symbolSize: 8,
        },
      ],
    }
  }

  // ── Velas (candlestick): [open, close, lowest, highest] por categoría ────────
  if (chartType === 'candlestick') {
    const keys = ['open', 'close', 'lowest', 'highest'] as const
    return {
      title: baseTitle,
      tooltip: { trigger: 'axis' },
      grid: gridOpt,
      xAxis: categoryAxis,
      yAxis: { type: 'value', scale: true },
      series: [
        {
          type: 'candlestick',
          data: rows.map((r) => keys.map((k) => numericValue(r[fields[k]]))),
        },
      ],
    }
  }

  // ── Caja y bigotes (boxplot): [min, Q1, mediana, Q3, max] por categoría ──────
  if (chartType === 'boxplot') {
    const keys = ['min', 'q1', 'median', 'q3', 'max'] as const
    return {
      title: baseTitle,
      tooltip: { trigger: 'item' },
      grid: gridOpt,
      xAxis: categoryAxis,
      yAxis: { type: 'value', scale: true },
      series: [
        {
          type: 'boxplot',
          data: rows.map((r) => keys.map((k) => numericValue(r[fields[k]]))),
        },
      ],
    }
  }

  // ── Barras / Líneas ─────────────────────────────────────────────────────────
  const eType = chartType === 'bar' ? 'bar' : 'line'

  let seriesData: { name: string; type: string; data: unknown[] }[]
  let categoryData: string[]

  if (series) {
    // Agrupar por columna de serie: solo se usa la primera columna de Y.
    const uniqueSeries = [...new Set(rows.map((r) => String(r[series] ?? '')))]
    categoryData = [...new Set(rows.map((r) => compositeValue(x, r)))]

    seriesData = uniqueSeries.map((sv) => ({
      name: sv,
      type: eType,
      data: categoryData.map((xv) => {
        const row = rows.find(
          (r) => compositeValue(x, r) === xv && String(r[series] ?? '') === sv,
        )
        return row ? row[y0] : null
      }),
    }))
  } else if (y.length > 1) {
    // Sin columna de serie pero con varias columnas en Y: cada una es su propia serie.
    categoryData = rows.map((r) => compositeValue(x, r))
    seriesData = y.map((yCol) => ({
      name: yCol,
      type: eType,
      data: rows.map((r) => r[yCol]),
    }))
  } else {
    categoryData = rows.map((r) => compositeValue(x, r))
    seriesData = [{ name: y0, type: eType, data: rows.map((r) => r[y0]) }]
  }

  return {
    title: baseTitle,
    legend: legendOpt,
    tooltip: { trigger: 'axis' as const },
    grid: gridOpt,
    xAxis: { ...categoryAxis, data: categoryData },
    yAxis: { type: 'value' as const },
    series: seriesData,
  } as EChartsOption
}

// ── Componente ─────────────────────────────────────────────────────────────────

interface ChartRendererProps {
  chartType: ChartType
  fieldMapping: FieldMapping
  visualConfig: VisualConfig
  rows: Record<string, unknown>[]
  className?: string
}

export function ChartRenderer({
  chartType,
  fieldMapping,
  visualConfig,
  rows,
  className = '',
}: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<ECharts | null>(null)

  // Inicializar / destruir instancia con el contenedor
  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    instanceRef.current = chart

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
      instanceRef.current = null
    }
  }, [])

  // Actualizar opciones cuando cambian los datos o la configuración
  useEffect(() => {
    if (!instanceRef.current) return
    const option = buildOption(chartType, fieldMapping, visualConfig, rows)
    instanceRef.current.setOption(option, true)
  }, [chartType, fieldMapping, visualConfig, rows])

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
