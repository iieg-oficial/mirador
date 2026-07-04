import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import { AGGREGATION_LABELS } from '@/types/charts'
import type { ChartSpec, LegendPosition } from '@/types/charts'
import { downloadCsv } from '@/lib/csv'
import { echartsTheme } from './themes'

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

// ── Overrides controlados (Fase 5) ─────────────────────────────────────────────

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Objetos se fusionan; arrays y escalares se reemplazan. El backend ya valida
// la whitelist y las claves peligrosas; aquí se re-filtra como segunda red.
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (DANGEROUS_KEYS.has(key)) continue
    const prev = out[key]
    out[key] = isPlainObject(prev) && isPlainObject(value) ? deepMerge(prev, value) : value
  }
  return out
}

/** Aplica los `overrides` de la spec (legend/tooltip/grid) sobre el option generado. */
export function applyOverrides(option: EChartsOption, spec: ChartSpec): EChartsOption {
  const overrides = spec.overrides
  if (!overrides) return option
  let out = option as Record<string, unknown>
  for (const section of ['legend', 'tooltip', 'grid'] as const) {
    const value = overrides[section]
    if (!isPlainObject(value)) continue
    const prev = out[section]
    out = { ...out, [section]: isPlainObject(prev) ? deepMerge(prev, value) : value }
  }
  return out as EChartsOption
}

// ── Render de tabla (no es ECharts) ───────────────────────────────────────────

const TABLE_PAGE_SIZE = 15

function formatCell(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString('es-MX')
  return String(v)
}

// Columnas en el orden de los encodings (x → y → tooltip), sin duplicar.
// Compartido por TableRenderer y la exportación CSV de gráficas (Fase 4, §7).
export function columnsForSpec(spec: ChartSpec, rows: Record<string, unknown>[]): string[] {
  const enc = spec.encodings
  const ordered = [...enc.x, ...enc.y, ...enc.tooltip].map((e) => e.field)
  const unique = [...new Set(ordered)]
  return unique.length > 0 ? unique : Object.keys(rows[0] ?? {})
}

function TableRenderer({ spec, rows, className = '', onExportReady }: ChartRendererProps) {
  const [page, setPage] = useState(0)

  const columns = useMemo(() => columnsForSpec(spec, rows), [spec, rows])

  useEffect(() => {
    onExportReady?.({ getPng: () => null, rows, columns })
  }, [rows, columns, onExportReady])

  const pages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const pageRows = rows.slice(current * TABLE_PAGE_SIZE, (current + 1) * TABLE_PAGE_SIZE)

  return (
    <div className={`flex h-full w-full flex-col ${className}`}>
      {(spec.visual.title || spec.interactions.download) && (
        <div className="mb-2 flex items-center">
          {spec.visual.title && (
            <p className="text-sm font-bold text-gray-800">{spec.visual.title}</p>
          )}
          {/* Mismo gate que el PNG de las gráficas ECharts: interactions.download. */}
          {spec.interactions.download && (
            <button
              onClick={() => downloadCsv(spec.visual.title || 'tabla', columns, rows)}
              disabled={rows.length === 0}
              className="ml-auto rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              Descargar CSV
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-100">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {columns.map((c) => (
                <th key={c} className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50/50">
                {columns.map((c) => (
                  <td key={c} className="border-b border-gray-100 px-3 py-1.5 text-gray-700">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-gray-500">
          <button
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40"
          >
            ‹
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

// ── Render de tarjeta KPI (no es ECharts) ─────────────────────────────────────

function KpiRenderer({ spec, rows, className = '', onExportReady }: ChartRendererProps) {
  const metric = spec.encodings.y[0]
  const raw = metric ? rows[0]?.[metric.field] : undefined
  const value =
    typeof raw === 'number'
      ? raw.toLocaleString('es-MX', { maximumFractionDigits: 2 })
      : raw != null
        ? String(raw)
        : '—'
  const caption =
    spec.visual.title ||
    metric?.label ||
    (metric ? `${metric.aggregation ? AGGREGATION_LABELS[metric.aggregation] + ' de ' : ''}${metric.field}` : '')

  useEffect(() => {
    onExportReady?.({ getPng: () => null, rows, columns: metric ? [metric.field] : Object.keys(rows[0] ?? {}) })
  }, [rows, metric, onExportReady])

  return (
    <div className={`flex h-full w-full flex-col items-center justify-center ${className}`}>
      <span className="text-4xl font-bold text-iieg-700">{value}</span>
      {caption && (
        <span className="mt-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          {caption}
        </span>
      )}
      {spec.visual.subtitle && (
        <span className="mt-1 text-xs text-gray-400">{spec.visual.subtitle}</span>
      )}
    </div>
  )
}

// ── Componente ─────────────────────────────────────────────────────────────────

/** Exportación (Fase 4, §7): snapshot de lo necesario para armar CSV/PNG/PDF. */
export interface ChartExportInfo {
  /** PNG en data URL; `null` para table/kpi (no son ECharts). */
  getPng: () => string | null
  rows: Record<string, unknown>[]
  columns: string[]
}

interface ChartRendererProps {
  spec: ChartSpec
  rows: Record<string, unknown>[]
  className?: string
  /** Cross-filtering (§6): notifica el `name` (categoría/dimensión) del dato
   * en el que se hizo clic. Solo lo dispara el renderer de ECharts. */
  onDataClick?: (name: string) => void
  /** Se dispara cada vez que hay datos listos para exportar (§7). */
  onExportReady?: (info: ChartExportInfo) => void
}

// Gráfica de código: ejecuta el JS del usuario (herramienta interna, sin la
// restricción RNF-01) y devuelve el EChartsOption. En scope: `rows` (filas del
// dataset) y `echarts` (el módulo). Debe `return` un objeto option.
function runUserOption(code: string, rows: Record<string, unknown>[]): EChartsOption {
  const fn = new Function('rows', 'echarts', code) as (
    r: Record<string, unknown>[],
    e: typeof echarts,
  ) => unknown
  const option = fn(rows, echarts)
  if (!option || typeof option !== 'object') {
    throw new Error('El código debe devolver (return) un objeto `option` de ECharts.')
  }
  return option as EChartsOption
}

// ── Render Plotly (gráficas de código Python) ──────────────────────────────────

// Ejecuta el Python del usuario (Pyodide) y monta la figura con plotly.js.
// Runtime y librería se cargan bajo demanda (dynamic import) para no engordar
// el bundle de quien nunca usa Plotly.
function PlotlyRenderer({ spec, rows, className = '', onExportReady }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const onExportReadyRef = useRef(onExportReady)
  onExportReadyRef.current = onExportReady

  const code = spec.code ?? ''
  useEffect(() => {
    const el = containerRef.current
    if (!el || !code) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [{ runPythonFigure }, Plotly] = await Promise.all([
          import('./pythonRuntime'),
          import('plotly.js-dist-min'),
        ])
        const fig = await runPythonFigure(code, rows)
        if (cancelled) return
        await Plotly.newPlot(el, fig.data, { autosize: true, ...fig.layout }, { responsive: true })
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
      if (!cancelled) {
        onExportReadyRef.current?.({
          // ponytail: sin PNG síncrono para Plotly (toImage es async), como table/kpi.
          getPng: () => null,
          rows,
          columns: columnsForSpec(spec, rows),
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo re-ejecutar al cambiar código o datos
  }, [code, rows])

  // La figura sigue a su contenedor (grid del tablero, panel lateral), igual
  // que el ResizeObserver de EchartsRenderer.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      void import('plotly.js-dist-min').then((Plotly) => Plotly.Plots.resize(el))
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      void import('plotly.js-dist-min').then((Plotly) => Plotly.purge(el))
    }
  }, [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <span className="text-xs text-gray-500">Cargando Python (Pyodide)…</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-4">
          <pre className="max-h-full overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </pre>
        </div>
      )}
      {spec.interactions.download && (
        <button
          onClick={() => downloadCsv(spec.visual.title || 'grafica', columnsForSpec(spec, rows), rows)}
          disabled={rows.length === 0}
          className="no-drag absolute right-1 top-1 rounded border border-gray-200 bg-white/90 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          CSV
        </button>
      )}
    </div>
  )
}

function EchartsRenderer({ spec, rows, className = '', onDataClick, onExportReady }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<ECharts | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const onDataClickRef = useRef(onDataClick)
  onDataClickRef.current = onDataClick
  const onExportReadyRef = useRef(onExportReady)
  onExportReadyRef.current = onExportReady

  // Inicializar / destruir instancia con el contenedor. El tema de ECharts
  // solo se aplica en init, así que un cambio de tema re-crea la instancia.
  const theme = echartsTheme(spec.style.theme)
  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, theme, { renderer: 'canvas' })
    instanceRef.current = chart
    chart.on('click', (params) => {
      if (typeof params.name === 'string' && params.name) onDataClickRef.current?.(params.name)
    })

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    // El tamaño del contenedor cambia sin que dispare `window.resize` (grid del
    // tablero, tirador de resize, panel lateral). Sin observarlo, el canvas se
    // queda con su tamaño inicial y la gráfica se ve cortada / no reacciona al
    // ajustar el ítem. El ResizeObserver hace que ECharts siga a su contenedor.
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      chart.dispose()
      instanceRef.current = null
    }
  }, [theme])

  // Actualizar opciones cuando cambian los datos o la configuración
  useEffect(() => {
    const chart = instanceRef.current
    if (!chart) return
    try {
      const option = spec.code
        ? runUserOption(spec.code, rows)
        : applyOverrides(buildOption(spec, rows), spec)
      chart.clear()
      chart.setOption(option, true)
      setCodeError(null)
    } catch (err) {
      chart.clear()
      setCodeError(err instanceof Error ? err.message : String(err))
    }
    onExportReadyRef.current?.({
      getPng: () => instanceRef.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }) ?? null,
      rows,
      columns: columnsForSpec(spec, rows),
    })
  }, [spec, rows])

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {codeError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-4">
          <pre className="max-h-full overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {codeError}
          </pre>
        </div>
      )}
      {/* CSV de la gráfica (§7): la tabla ya tiene su propio botón; el resto de
       * tipos ECharts lo obtienen aquí, mismo gate que el PNG del toolbox. */}
      {spec.interactions.download && (
        <button
          onClick={() => downloadCsv(spec.visual.title || 'grafica', columnsForSpec(spec, rows), rows)}
          disabled={rows.length === 0}
          className="no-drag absolute right-1 top-1 rounded border border-gray-200 bg-white/90 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          CSV
        </button>
      )}
    </div>
  )
}

export function ChartRenderer(props: ChartRendererProps) {
  // Gráfica de código: el motor decide quién la materializa (JS→ECharts, Python→Plotly).
  if (props.spec.code) {
    return props.spec.code_engine === 'plotly' ? (
      <PlotlyRenderer {...props} />
    ) : (
      <EchartsRenderer {...props} />
    )
  }
  // table y kpi se renderizan como componentes React; el resto con ECharts.
  switch (props.spec.visual.chart_type) {
    case 'table':
      return <TableRenderer {...props} />
    case 'kpi':
      return <KpiRenderer {...props} />
    default:
      return <EchartsRenderer {...props} />
  }
}
