import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { ChartType, FieldMapping, VisualConfig } from '@/types/charts'

// ── Transformador spec → ECharts option ───────────────────────────────────────

function buildOption(
  chartType: ChartType,
  fieldMapping: FieldMapping,
  visualConfig: VisualConfig,
  rows: Record<string, unknown>[],
): EChartsOption {
  const { x, y, series } = fieldMapping
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
    ? { show: true, [legend_position]: legend_position === 'top' || legend_position === 'bottom' ? 0 : 0 }
    : { show: false }

  // ── Pastel / Dona ──────────────────────────────────────────────────────────
  if (chartType === 'pie' || chartType === 'donut') {
    return {
      title: baseTitle,
      legend: legendOpt,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: chartType === 'donut' ? ['40%', '70%'] : '65%',
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{d}%' },
          data: rows.map((r) => ({ name: String(r[x] ?? ''), value: r[y] })),
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
      xAxis: { type: 'value', name: x },
      yAxis: { type: 'value', name: y },
      series: [
        {
          type: 'scatter',
          data: rows.map((r) => [r[x], r[y]]),
          symbolSize: 8,
        },
      ],
    }
  }

  // ── Barras, Líneas, Área ───────────────────────────────────────────────────
  const isHorizontal = chartType === 'bar_horizontal'
  const eType = chartType.startsWith('bar') ? 'bar' : 'line'
  const isArea = chartType === 'area'
  const areaStyle = isArea ? { opacity: 0.25 } : undefined

  let seriesData: { name: string; type: string; areaStyle?: { opacity: number }; data: unknown[] }[]
  let categoryData: string[]

  if (series) {
    const uniqueSeries = [...new Set(rows.map((r) => String(r[series] ?? '')))]
    categoryData = [...new Set(rows.map((r) => String(r[x] ?? '')))]

    seriesData = uniqueSeries.map((sv) => ({
      name: sv,
      type: eType,
      areaStyle,
      data: categoryData.map((xv) => {
        const row = rows.find(
          (r) => String(r[x] ?? '') === xv && String(r[series] ?? '') === sv,
        )
        return row ? row[y] : null
      }),
    }))
  } else {
    categoryData = rows.map((r) => String(r[x] ?? ''))
    seriesData = [{ name: y, type: eType, areaStyle, data: rows.map((r) => r[y]) }]
  }

  const catAxis = {
    type: 'category' as const,
    data: categoryData,
    axisLabel: { overflow: 'truncate' as const, width: 80 },
  }
  const valAxis = { type: 'value' as const }

  return {
    title: baseTitle,
    legend: legendOpt,
    tooltip: { trigger: 'axis' as const },
    grid: { containLabel: true, left: 16, right: 16, top: title ? 56 : 16, bottom: 16 },
    ...(isHorizontal
      ? { xAxis: valAxis, yAxis: { ...catAxis, inverse: true } }
      : { xAxis: catAxis, yAxis: valAxis }),
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
