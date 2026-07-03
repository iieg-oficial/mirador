import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { getDashboard, replaceItems, updateDashboard } from './api'
import { ChartItemBlock } from './ChartItemBlock'
import { MarkdownItemBlock } from './MarkdownItemBlock'
import { ChartPickerModal } from './ChartPickerModal'
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

function filterSpecToText(f: FilterSpec): string {
  return Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? '')
}

// Fila libre siguiente: apila los items nuevos debajo de todo lo existente.
function nextFreeRow(items: DashboardItemRead[]): number {
  return items.reduce((max, it) => Math.max(max, it.position_config.y + it.position_config.h), 0)
}

// ── Barra de filtros (globales o locales de un item) ────────────────────────
// ponytail: sin dataset fijo por filtro (global cruza varios charts, y local
// no vale la pena resolver el schema del dataset solo para tipar el valor),
// así que draftToFilter recibe columns=[] y todo viaja como texto/lista.
// Si hace falta comparar numéricamente, es fácil pasar las columnas reales.

function FilterBar({
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

export function TableroEditor() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard(id!),
    enabled: !!id,
  })

  const [items, setItems] = useState<DashboardItemRead[]>([])
  const [globalFilterDrafts, setGlobalFilterDrafts] = useState<FilterDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [kpiValues, setKpiValues] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!dashboard) return
    setItems(dashboard.items)
    setGlobalFilterDrafts(dashboard.global_filters.map(filterToDraft))
  }, [dashboard])

  const globalFilters = useMemo(
    () => globalFilterDrafts.filter((f) => f.field).map((f) => draftToFilter(f, [])),
    [globalFilterDrafts],
  )

  const selectedItem = items.find((it) => it.id === selectedId) ?? null

  const selectedChartQuery = useQuery({
    queryKey: ['chart', selectedItem?.chart_id],
    queryFn: () => getChart(selectedItem!.chart_id!),
    enabled: !!selectedItem?.chart_id,
  })

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

  const templateContext: TemplateContext = useMemo(
    () => ({
      kpi: kpiValues,
      filter: Object.fromEntries(globalFilters.map((f) => [f.field, filterSpecToText(f)])),
      dashboard: {
        title: dashboard?.name ?? '',
        description: dashboard?.description ?? '',
        updated_at: dashboard?.updated_at ?? '',
      },
    }),
    [kpiValues, globalFilters, dashboard],
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
          <h1 className="text-lg font-bold text-gray-900">{dashboard.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
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
        </div>
      </div>

      {/* Filtros globales */}
      <div className="border-b border-gray-100 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Filtros globales</p>
          <button
            onClick={() => saveFiltersMutation.mutate()}
            disabled={saveFiltersMutation.isPending}
            className="rounded-lg border border-iieg-300 px-2.5 py-1 text-xs font-medium text-iieg-700 hover:bg-iieg-50 disabled:opacity-40"
          >
            {saveFiltersMutation.isPending ? 'Guardando…' : 'Guardar filtros'}
          </button>
        </div>
        <div className="mt-2 max-w-3xl">
          <FilterBar filters={globalFilterDrafts} onChange={setGlobalFilterDrafts} />
        </div>
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
              onLayoutChange={handleLayoutChange}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`group flex flex-col overflow-hidden rounded-xl border ${
                    selectedId === item.id ? 'border-iieg-500 ring-1 ring-iieg-500' : 'border-gray-100'
                  }`}
                >
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
                  <div className="min-h-0 flex-1 bg-white p-2">
                    {item.item_type === 'chart' ? (
                      <ChartItemBlock
                        item={item}
                        globalFilters={globalFilters}
                        onKpiResolved={handleKpiResolved}
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

        {selectedItem && (
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
                  <FilterBar
                    filters={selectedLocalFilters}
                    onChange={(drafts) =>
                      updateLocalConfig(selectedItem.id, {
                        filters: drafts.filter((d) => d.field).map((d) => draftToFilter(d, [])),
                      })
                    }
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
