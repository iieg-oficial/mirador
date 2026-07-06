import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getChart, previewSpec } from '@/features/charts/api'
import { ChartRenderer } from '@/features/charts/ChartRenderer'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import type { ChartExportInfo } from '@/features/charts/ChartRenderer'
import type { FilterSpec } from '@/types/charts'
import type { DashboardItemRead } from '@/types/dashboards'

interface Props {
  item: DashboardItemRead
  globalFilters: FilterSpec[]
  className?: string
  /** Reporta el valor ya formateado de una gráfica KPI referenciada, para que
   * el editor lo exponga como `kpi.<variable_key>` en el contexto Markdown. */
  onKpiResolved?: (variableKey: string, value: string) => void
  /** Cross-filtering (§6): reporta el valor clicado en esta gráfica. */
  onDataClick?: (value: string) => void
  /** Exportación del tablero (§7): snapshot de datos listos para PNG/CSV/PDF. */
  onExportReady?: (info: ChartExportInfo) => void
}

function localFiltersOf(item: DashboardItemRead): FilterSpec[] {
  const raw = item.local_config.filters
  return Array.isArray(raw) ? (raw as FilterSpec[]) : []
}

export function ChartItemBlock({
  item,
  globalFilters,
  className = '',
  onKpiResolved,
  onDataClick,
  onExportReady,
}: Props) {
  const chartId = item.chart_id
  const {
    data: chart,
    isLoading: loadingChart,
    error: chartError,
  } = useQuery({
    queryKey: ['chart', chartId],
    queryFn: () => getChart(chartId!),
    enabled: !!chartId,
  })

  const localFilters = useMemo(() => localFiltersOf(item), [item])

  // Clona la spec guardada de la Chart y mergea filtros globales + locales;
  // el preview se pide sin persistir vía el endpoint genérico de spec.
  const spec = useMemo(() => {
    if (!chart) return null
    const cloned = structuredClone(chart.chart_spec)
    cloned.data.filters = [...globalFilters, ...localFilters]
    return cloned
  }, [chart, globalFilters, localFilters])

  const {
    data: preview,
    isLoading: loadingPreview,
    error: previewError,
  } = useQuery({
    queryKey: ['dashboard-item-preview', item.id, spec],
    queryFn: () => previewSpec(spec!),
    enabled: !!spec,
  })

  useEffect(() => {
    if (!onKpiResolved || !chart || chart.chart_type !== 'kpi' || !preview) return
    const variableKey = item.local_config.variable_key
    if (typeof variableKey !== 'string' || !variableKey) return
    const metricField = chart.chart_spec.encodings.y[0]?.field
    const raw = metricField ? preview.rows[0]?.[metricField] : undefined
    const formatted = typeof raw === 'number' ? raw.toLocaleString('es-MX') : raw != null ? String(raw) : ''
    onKpiResolved(variableKey, formatted)
  }, [chart, preview, item.local_config.variable_key, onKpiResolved])

  if (!chartId) {
    return (
      <div className={`flex h-full items-center justify-center text-xs text-gray-400 ${className}`}>
        Item sin gráfica asociada
      </div>
    )
  }

  if (chartError || previewError) {
    return (
      <div className={`flex h-full items-center justify-center p-3 text-center ${className}`}>
        <ErrorBanner error={chartError ?? previewError} compact small />
      </div>
    )
  }

  if (loadingChart || loadingPreview || !chart || !preview || !spec) {
    return (
      <div className={`flex h-full items-center justify-center text-xs text-gray-400 ${className}`}>
        Cargando…
      </div>
    )
  }

  return (
    <ChartRenderer
      spec={spec}
      rows={preview.rows}
      className={className}
      onDataClick={onDataClick}
      onExportReady={onExportReady}
    />
  )
}
