import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { ChartSpec, LegendPosition } from '@/types/charts'

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

// ── Transformador ChartSpec → ECharts option (RF-09: exportado para poder
// mostrar el option generado como referencia técnica en el editor avanzado) ────

export function buildOption(spec: ChartSpec, rows: Record<string, unknown>[]): EChartsOption {
  const chartType = spec.visual.chart_type
  const x = spec.encodings.x.map((e) => e.field)
  const y = spec.encodings.y.map((e) => e.field)
  const series = spec.encodings.color?.field
  const fields = spec.encodings.fields ?? {}
  const x0 = x[0] ?? ''
  const y0 = y[0] ?? ''
  const title = spec.visual.title ?? ''
  const subtitle = spec.visual.subtitle ?? ''
  const showLegend = spec.interactions.legend
  const showLabels = spec.style.show_labels
  const horizontal = spec.style.orientation === 'horizontal'

  const baseTitle: EChartsOption['title'] = {
    text: title,
    subtext: subtitle,
    left: 'left',
    textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
    subtextStyle: { fontSize: 12, color: '#6b7280' },
  }

  const legendOpt: EChartsOption['legend'] = showLegend
    ? { show: true, ...legendPositionOption(spec.style.legend_position) }
    : { show: false }

  const tooltipEnabled = spec.interactions.tooltip
  const extras: Partial<EChartsOption> = {}
  if (spec.interactions.zoom) {
    extras.dataZoom = [{ type: 'inside' }]
  }
  if (spec.interactions.download) {
    extras.toolbox = { feature: { saveAsImage: { title: 'Descargar' } } }
  }

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
      tooltip: { show: tooltipEnabled, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      ...extras,
      series: [
        {
          type: 'pie',
          radius: '65%',
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: showLabels || undefined, formatter: '{b}\n{d}%' },
          data: rows.map((r) => ({ name: compositeValue(x, r), value: numericValue(r[y0]) })),
        },
      ],
    }
  }

  // ── Treemap ─────────────────────────────────────────────────────────────────
  if (chartType === 'treemap') {
    return {
      title: baseTitle,
      tooltip: { show: tooltipEnabled, trigger: 'item', formatter: '{b}: {c}' },
      ...extras,
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
      tooltip: { show: tooltipEnabled, trigger: 'item' },
      ...extras,
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
      tooltip: { show: tooltipEnabled, trigger: 'axis' },
      grid: gridOpt,
      ...extras,
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
      tooltip: { show: tooltipEnabled, trigger: 'item' },
      grid: gridOpt,
      ...extras,
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

  let seriesData: { name: string; type: string; data: unknown[]; label?: { show: boolean } }[]
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

  if (showLabels) {
    seriesData = seriesData.map((s) => ({ ...s, label: { show: true } }))
  }

  const catAxis = { ...categoryAxis, data: categoryData }
  const valAxis = { type: 'value' as const }

  return {
    title: baseTitle,
    legend: legendOpt,
    tooltip: { show: tooltipEnabled, trigger: 'axis' as const },
    grid: gridOpt,
    ...extras,
    // Barras horizontales: se intercambian los ejes.
    xAxis: horizontal && chartType === 'bar' ? valAxis : catAxis,
    yAxis: horizontal && chartType === 'bar' ? catAxis : valAxis,
    series: seriesData,
  } as EChartsOption
}

// ── Componente ─────────────────────────────────────────────────────────────────

interface ChartRendererProps {
  spec: ChartSpec
  rows: Record<string, unknown>[]
  className?: string
}

export function ChartRenderer({ spec, rows, className = '' }: ChartRendererProps) {
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
    instanceRef.current.setOption(buildOption(spec, rows), true)
  }, [spec, rows])

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
