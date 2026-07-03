import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { getDashboard, replaceItems, updateDashboard } from './api'
import { ChartItemBlock } from './ChartItemBlock'
import { MarkdownItemBlock } from './MarkdownItemBlock'
import { ChartPickerModal } from './ChartPickerModal'
import { DashboardFilterBar } from './filters/DashboardFilterBar'
import { FilterConfigPanel } from './filters/FilterConfigPanel'
import {
  defaultFilterValues,
  filterTemplateContext,
  resolveItemFilters,
} from './filters/dashboardFilters'
import type { DashboardFilter, FilterOption, FilterTarget } from './filters/dashboardFilters'
import { crossFilterOf, resolveCrossFilters, toggleInteraction } from './filters/interactions'
import { draftToFilter, filterToDraft } from '@/features/charts/filters'
import type { FilterDraft } from '@/features/charts/filters'
import { getChart } from '@/features/charts/api'
import { FILTER_OPERATOR_LABELS } from '@/types/charts'
import type { Chart, FilterOperator, FilterSpec } from '@/types/charts'
import type { DashboardItemPayload, DashboardItemRead } from '@/types/dashboards'
import type { TemplateContext } from './utils/resolveDashboardTemplate'

const ResponsiveGridLayout = WidthProvider(Responsive)

const DEFAULT_CHART_SIZE = { w: 6, h: 4 }
const DEFAULT_MARKDOWN_SIZE = { w: 6, h: 3 }
const GRID_COLS = 12

function toPayload(item: DashboardItemRead): DashboardItemPayload {
  return {
    chart_id: item.chart_id,
    item_type: item.item_type,
    position_config: item.position_config,
    local_config: item.local_config,
  }
}

// Fila libre siguiente: apila los items nuevos debajo de todo lo existente.
function nextFreeRow(items: DashboardItemRead[]): number {
  return items.reduce((max, it) => Math.max(max, it.position_config.y + it.position_config.h), 0)
}

// Estado de filtros/interacciones persistido en la URL (§6, "persistencia de
// filtros en URL"): un único query param `f` con `{v: filterValues, x: interactions}`.
interface UrlFilterState {
  v: Record<string, unknown>
  x: Record<string, unknown>
}

function parseUrlFilterState(raw: string | null): UrlFilterState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<UrlFilterState>
    return { v: parsed.v ?? {}, x: parsed.x ?? {} }
  } catch {
    return null
  }
}

// ── Barra de filtros LOCALES de un item (avanzado, sigue siendo FilterSpec) ──
function LocalFilterBar({
  filters,
  onChange,
}: {
  filters: FilterDraft[]
  onChange: (filters: FilterDraft[]) => void
}) {
  return (
    <div className="space-y-1.5">
      {filters.map((f, i) => {
        const noValue = f.operator === 'is_null' || f.operator === 'is_not_null'
        const listValue = f.operator === 'in' || f.operator === 'not_in' || f.operator === 'between'
        const setFilter = (patch: Partial<FilterDraft>) =>
          onChange(filters.map((ff, j) => (j === i ? { ...ff, ...patch } : ff)))
        return (
          <div key={i} className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-100 p-1.5">
            <input
              type="text"
              value={f.field}
              onChange={(e) => setFilter({ field: e.target.value })}
              placeholder="Campo"
              className="w-24 min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs"
            />
            <select
              value={f.operator}
              onChange={(e) => setFilter({ operator: e.target.value as FilterOperator })}
              className="rounded border border-gray-200 px-1.5 py-1 text-xs"
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
                className="w-28 min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs"
              />
            )}
            <button
              type="button"
              onClick={() => onChange(filters.filter((_, j) => j !== i))}
              className="no-drag rounded px-1 text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...filters, { field: '', operator: '=', value: '' }])}
        className="no-drag rounded px-1.5 py-0.5 text-xs font-semibold text-iieg-600 hover:bg-iieg-50"
      >
        + Agregar filtro
      </button>
    </div>
  )
}

// ── Config de cross-filtering de un item chart (§6): clic → filtra otros ──
function CrossFilterEditor({
  config,
  onChange,
  otherChartItems,
}: {
  config: { enabled: boolean; targets: FilterTarget[] }
  onChange: (config: { enabled: boolean; targets: FilterTarget[] }) => void
  otherChartItems: { id: string; label: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
        />
        Al hacer clic en un dato, filtrar otras gráficas
      </label>
      {config.enabled && (
        <div className="space-y-1 rounded bg-gray-50 p-1.5">
          {otherChartItems.length === 0 && (
            <p className="text-[11px] text-gray-400">No hay otras gráficas en el tablero.</p>
          )}
          {otherChartItems.map((it) => {
            const target = config.targets.find((t) => t.item_id === it.id)
            return (
              <div key={it.id} className="flex items-center gap-1.5">
                <label className="flex flex-1 items-center gap-1 truncate text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={!!target}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        targets: e.target.checked
                          ? [...config.targets, { item_id: it.id, field: '' }]
                          : config.targets.filter((t) => t.item_id !== it.id),
                      })
                    }
                  />
                  {it.label}
                </label>
                {target && (
                  <input
                    value={target.field}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        targets: config.targets.map((t) =>
                          t.item_id === it.id ? { ...t, field: e.target.value } : t,
                        ),
                      })
                    }
                    placeholder="campo"
                    className="w-24 rounded border border-gray-200 px-1.5 py-0.5 text-[11px]"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TableroEditor() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id!),
    enabled: !!id,
  })

  const [items, setItems] = useState<DashboardItemRead[]>([])
  const [globalFilters, setGlobalFilters] = useState<DashboardFilter[]>([])
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({})
  const [interactions, setInteractions] = useState<Record<string, unknown>>({})
  const [filterOptions, setFilterOptions] = useState<Record<string, FilterOption[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showFilterConfig, setShowFilterConfig] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  // Evita que el efecto de sincronización a la URL borre el estado inicial
  // (leído de la URL) antes de que el tablero termine de cargar.
  const urlSyncReady = useRef(false)

  useEffect(() => {
    if (!dashboard) return
    setItems(dashboard.items)
    setGlobalFilters(dashboard.global_filters)
    const fromUrl = parseUrlFilterState(searchParams.get('f'))
    setFilterValues(fromUrl?.v ?? defaultFilterValues(dashboard.global_filters))
    setInteractions(fromUrl?.x ?? {})
    urlSyncReady.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard])

  // Persiste filtros + interacciones activas en la URL (`?f=`) para que un
  // tablero filtrado se pueda compartir/recargar con el mismo estado.
  useEffect(() => {
    if (!urlSyncReady.current) return
    const hasState = Object.keys(filterValues).length > 0 || Object.keys(interactions).length > 0
    const next = new URLSearchParams(searchParams)
    if (hasState) next.set('f', JSON.stringify({ v: filterValues, x: interactions }))
    else next.delete('f')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues, interactions])

  const selectedItem = items.find((it) => it.id === selectedId) ?? null

  const selectedChartQuery = useQuery({
    queryKey: ['chart', selectedItem?.chart_id],
    queryFn: () => getChart(selectedItem!.chart_id!),
    enabled: !!selectedItem?.chart_id,
  })

  const chartItems = useMemo(
    () =>
      items
        .filter((it) => it.item_type === 'chart')
        .map((it, idx) => ({ id: it.id, label: `Gráfica ${idx + 1}` })),
    [items],
  )

  function updateLocalConfig(itemId: string, patch: Record<string, unknown>) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, local_config: { ...it.local_config, ...patch } } : it,
      ),
    )
  }

  function removeItem(itemId: string) {
    setItems((prev) => prev.filter((it) => it.id !== itemId))
    setSelectedId((prev) => (prev === itemId ? null : prev))
  }

  function addChartItem(chart: Chart) {
    const item: DashboardItemRead = {
      id: crypto.randomUUID(),
      dashboard_id: id!,
      chart_id: chart.id,
      item_type: 'chart',
      position_config: { x: 0, y: nextFreeRow(items), ...DEFAULT_CHART_SIZE },
      local_config: {},
    }
    setItems((prev) => [...prev, item])
    setShowPicker(false)
    setSelectedId(item.id)
  }

  function addMarkdownItem() {
    const item: DashboardItemRead = {
      id: crypto.randomUUID(),
      dashboard_id: id!,
      chart_id: null,
      item_type: 'markdown',
      position_config: { x: 0, y: nextFreeRow(items), ...DEFAULT_MARKDOWN_SIZE },
      local_config: { content: '' },
    }
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
  }

  function handleLayoutChange(layout: Layout) {
    setItems((prev) =>
      prev.map((it) => {
        const l = layout.find((ll) => ll.i === it.id)
        return l ? { ...it, position_config: { x: l.x, y: l.y, w: l.w, h: l.h } } : it
      }),
    )
  }

  const saveItemsMutation = useMutation({
    mutationFn: () => replaceItems(id!, items.map(toPayload)),
    onSuccess: (savedItems) => {
      setItems(savedItems)
      setSaveError(null)
      qc.invalidateQueries({ queryKey: ['dashboard', id] })
    },
    onError: (err) => setSaveError((err as Error).message),
  })

  const saveFiltersMutation = useMutation({
    mutationFn: () => updateDashboard(id!, { global_filters: globalFilters }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', id] }),
  })

  const handleKpiResolved = useCallback((variableKey: string, value: string) => {
    setKpiValues((prev) => (prev[variableKey] === value ? prev : { ...prev, [variableKey]: value }))
  }, [])

  const handleDataClick = useCallback(
    (itemId: string) => (value: string) => setInteractions((prev) => toggleInteraction(prev, itemId, value)),
    [],
  )

  const handleOptions = useCallback((filterId: string, options: FilterOption[]) => {
    setFilterOptions((prev) => (prev[filterId] === options ? prev : { ...prev, [filterId]: options }))
  }, [])

  const templateContext: TemplateContext = useMemo(
    () => ({
      kpi: kpiValues,
      filter: filterTemplateContext(globalFilters, filterValues, filterOptions),
      dashboard: {
        title: dashboard?.name ?? '',
        description: dashboard?.description ?? '',
        updated_at: dashboard?.updated_at ?? '',
      },
    }),
    [kpiValues, globalFilters, filterValues, filterOptions, dashboard],
  )

  const layout = useMemo(() => items.map((it) => ({ i: it.id, ...it.position_config })), [items])

  if (isLoading || !dashboard) {
    return <p className="p-6 text-sm text-gray-400">Cargando tablero…</p>
  }

  const selectedIsKpi =
    selectedItem?.item_type === 'chart' && selectedChartQuery.data?.chart_type === 'kpi'
  const selectedLocalFilters: FilterDraft[] = Array.isArray(selectedItem?.local_config.filters)
    ? (selectedItem!.local_config.filters as FilterSpec[]).map(filterToDraft)
    : []

  return (
    <div className="flex h-full flex-col">
      {/* Header / toolbar */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <div>
          <Link to="/admin/tableros" className="text-xs text-gray-400 hover:text-gray-600">
            ← Tableros
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            {dashboard.name}
            {previewMode && <span className="ml-2 text-xs font-medium text-iieg-600">· Vista previa</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          {!previewMode && (
            <>
              <button
                onClick={() => setShowPicker(true)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Agregar gráfica
              </button>
              <button
                onClick={addMarkdownItem}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Agregar Markdown
              </button>
              <button
                onClick={() => saveItemsMutation.mutate()}
                disabled={saveItemsMutation.isPending}
                className="rounded-lg bg-iieg-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
              >
                {saveItemsMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
          <button
            onClick={() => {
              setPreviewMode((p) => !p)
              setSelectedId(null)
              setShowFilterConfig(false)
            }}
            className="rounded-lg border border-iieg-300 px-3 py-1.5 text-xs font-medium text-iieg-700 hover:bg-iieg-50"
          >
            {previewMode ? 'Volver al editor' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Filtros globales */}
      <div className="border-b border-gray-100 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Filtros globales</p>
          {!previewMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilterConfig((s) => !s)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {showFilterConfig ? 'Cerrar configuración' : 'Configurar'}
              </button>
              <button
                onClick={() => saveFiltersMutation.mutate()}
                disabled={saveFiltersMutation.isPending}
                className="rounded-lg border border-iieg-300 px-2.5 py-1 text-xs font-medium text-iieg-700 hover:bg-iieg-50 disabled:opacity-40"
              >
                {saveFiltersMutation.isPending ? 'Guardando…' : 'Guardar filtros'}
              </button>
            </div>
          )}
        </div>

        {showFilterConfig && !previewMode && (
          <div className="mt-2 max-w-md">
            <FilterConfigPanel
              filters={globalFilters}
              onChange={setGlobalFilters}
              chartItems={chartItems}
            />
          </div>
        )}

        <div className="mt-2">
          <DashboardFilterBar
            filters={globalFilters}
            values={filterValues}
            optionsById={filterOptions}
            onChange={setFilterValues}
            onOptions={handleOptions}
            onClear={() => setFilterValues(defaultFilterValues(globalFilters))}
          />
        </div>

        {Object.keys(interactions).length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Filtro por clic:
            </span>
            {Object.entries(interactions).map(([sourceId, value]) => (
              <span
                key={sourceId}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
              >
                {chartItems.find((c) => c.id === sourceId)?.label ?? sourceId}: {String(value)}
                <button
                  type="button"
                  onClick={() =>
                    setInteractions((prev) => {
                      const next = { ...prev }
                      delete next[sourceId]
                      return next
                    })
                  }
                  className="text-amber-400 hover:text-amber-700"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setInteractions({})}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100"
            >
              Limpiar clics
            </button>
          </div>
        )}
      </div>

      {/* Grid + panel lateral */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {items.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
              <p>Este tablero no tiene items todavía.</p>
              <p className="text-xs">Agrega una gráfica o un bloque de Markdown para comenzar.</p>
            </div>
          ) : (
            <ResponsiveGridLayout
              className="layout"
              layouts={{ lg: layout }}
              breakpoints={{ lg: 0 }}
              cols={{ lg: GRID_COLS }}
              rowHeight={40}
              margin={[12, 12]}
              draggableCancel=".no-drag"
              isDraggable={!previewMode}
              isResizable={!previewMode}
              onLayoutChange={handleLayoutChange}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => !previewMode && setSelectedId(item.id)}
                  className={`group flex flex-col overflow-hidden rounded-xl border ${
                    !previewMode && selectedId === item.id
                      ? 'border-iieg-500 ring-1 ring-iieg-500'
                      : 'border-gray-100'
                  }`}
                >
                  {!previewMode && (
                    <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      <span>{item.item_type === 'chart' ? 'Gráfica' : 'Markdown'}</span>
                      <button
                        className="no-drag rounded px-1 text-gray-400 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeItem(item.id)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 bg-white p-2">
                    {item.item_type === 'chart' ? (
                      <ChartItemBlock
                        item={item}
                        globalFilters={[
                          ...resolveItemFilters(globalFilters, filterValues, item.id),
                          ...resolveCrossFilters(items, interactions, item.id),
                        ]}
                        onKpiResolved={handleKpiResolved}
                        onDataClick={handleDataClick(item.id)}
                        className="h-full w-full"
                      />
                    ) : (
                      <MarkdownItemBlock
                        content={String(item.local_config.content ?? '')}
                        context={templateContext}
                        className="h-full w-full"
                      />
                    )}
                  </div>
                </div>
              ))}
            </ResponsiveGridLayout>
          )}
        </div>

        {selectedItem && !previewMode && (
          <div className="w-80 flex-shrink-0 space-y-4 overflow-y-auto border-l border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {selectedItem.item_type === 'chart' ? 'Gráfica' : 'Markdown'}
              </p>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            {selectedItem.item_type === 'chart' && (
              <>
                <div>
                  <p className="mb-1 text-xs font-semibold text-gray-600">Filtros locales</p>
                  <LocalFilterBar
                    filters={selectedLocalFilters}
                    onChange={(drafts) =>
                      updateLocalConfig(selectedItem.id, {
                        filters: drafts.filter((d) => d.field).map((d) => draftToFilter(d, [])),
                      })
                    }
                  />
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <p className="mb-1 text-xs font-semibold text-gray-600">Interactividad</p>
                  <CrossFilterEditor
                    config={crossFilterOf(selectedItem.local_config)}
                    onChange={(config) => updateLocalConfig(selectedItem.id, { cross_filter: config })}
                    otherChartItems={chartItems.filter((c) => c.id !== selectedItem.id)}
                  />
                </div>
                {selectedIsKpi && (
                  <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
                    <label className="text-xs font-semibold text-gray-600">Variable KPI (variable_key)</label>
                    <input
                      type="text"
                      value={String(selectedItem.local_config.variable_key ?? '')}
                      onChange={(e) => updateLocalConfig(selectedItem.id, { variable_key: e.target.value })}
                      placeholder="p.ej. total_ventas"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
                    />
                    <p className="text-[11px] text-gray-400">
                      Disponible en Markdown como{' '}
                      <code className="rounded bg-gray-100 px-1">{'{{ kpi.<variable_key> }}'}</code>
                    </p>
                  </div>
                )}
              </>
            )}

            {selectedItem.item_type === 'markdown' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Contenido (Markdown)</label>
                  <textarea
                    value={String(selectedItem.local_config.content ?? '')}
                    onChange={(e) => updateLocalConfig(selectedItem.id, { content: e.target.value })}
                    rows={10}
                    className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-iieg-400 focus:outline-none"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-gray-600">Vista previa</p>
                  <div className="rounded-lg border border-gray-100 p-3">
                    <MarkdownItemBlock
                      content={String(selectedItem.local_config.content ?? '')}
                      context={templateContext}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showPicker && <ChartPickerModal onPick={addChartItem} onClose={() => setShowPicker(false)} />}
    </div>
  )
}
