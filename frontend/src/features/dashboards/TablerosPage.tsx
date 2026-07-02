import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  listDashboards,
  getDashboard,
  createDashboard,
  deleteDashboard,
  replaceItems,
} from './api'
import { listCharts, previewSpec } from '@/features/charts/api'
import { ChartRenderer } from '@/features/charts/ChartRenderer'
import type { Chart } from '@/types/charts'
import type { Dashboard, DashboardItemPayload } from '@/types/dashboards'

const Grid = WidthProvider(GridLayout)

// ── Item del grid en edición (estado local antes de guardar) ──────────────────

interface DraftItem {
  key: string
  chartId: string | null
  itemType: 'chart' | 'text'
  localConfig: Record<string, unknown>
  layout: { x: number; y: number; w: number; h: number }
}

let _keySeq = 0
function nextKey(): string {
  _keySeq += 1
  return `item-${Date.now()}-${_keySeq}`
}

// ── Widget de gráfica: ejecuta la spec guardada vía preview por spec ──────────

function ChartWidget({ chart }: { chart: Chart }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['dash-preview', chart.id, chart.updated_at],
    queryFn: () => previewSpec(chart.chart_spec),
    staleTime: 60_000,
  })

  if (isLoading) {
    return <p className="p-3 text-xs text-gray-400">Cargando {chart.name}…</p>
  }
  if (error) {
    return (
      <div className="p-3 text-xs text-red-600">
        {chart.name}: {(error as Error).message}
      </div>
    )
  }
  return <ChartRenderer spec={chart.chart_spec} rows={data?.rows ?? []} />
}

// ── Editor de un tablero ──────────────────────────────────────────────────────

function DashboardEditor({ dashboard, onBack }: { dashboard: Dashboard; onBack: () => void }) {
  const qc = useQueryClient()
  const [items, setItems] = useState<DraftItem[] | null>(null)
  const [showChartPicker, setShowChartPicker] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const { data: detail } = useQuery({
    queryKey: ['dashboard', dashboard.id],
    queryFn: () => getDashboard(dashboard.id),
  })
  const { data: charts = [] } = useQuery({ queryKey: ['charts'], queryFn: listCharts })

  // Estado inicial de edición desde los items persistidos.
  const draft: DraftItem[] =
    items ??
    (detail?.items ?? []).map((i) => ({
      key: i.id,
      chartId: i.chart_id,
      itemType: i.item_type,
      localConfig: i.local_config,
      layout: i.position_config,
    }))

  const chartsById = useMemo(() => new Map(charts.map((c) => [c.id, c])), [charts])

  function addChart(chart: Chart) {
    const y = Math.max(0, ...draft.map((d) => d.layout.y + d.layout.h))
    setItems([
      ...draft,
      {
        key: nextKey(),
        chartId: chart.id,
        itemType: 'chart',
        localConfig: {},
        layout: { x: 0, y, w: 6, h: 4 },
      },
    ])
    setShowChartPicker(false)
  }

  function addText() {
    const y = Math.max(0, ...draft.map((d) => d.layout.y + d.layout.h))
    setItems([
      ...draft,
      {
        key: nextKey(),
        chartId: null,
        itemType: 'text',
        localConfig: { content: 'Escribe una nota…' },
        layout: { x: 0, y, w: 4, h: 2 },
      },
    ])
  }

  function removeItem(key: string) {
    setItems(draft.filter((d) => d.key !== key))
  }

  function onLayoutChange(layout: Layout[]) {
    const byKey = new Map(layout.map((l) => [l.i, l]))
    setItems(
      draft.map((d) => {
        const l = byKey.get(d.key)
        return l ? { ...d, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : d
      }),
    )
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: DashboardItemPayload[] = draft.map((d) => ({
        chart_id: d.chartId,
        item_type: d.itemType,
        position_config: d.layout,
        local_config: d.localConfig,
      }))
      return replaceItems(dashboard.id, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboard.id] })
      setItems(null) // vuelve a partir del estado persistido
      setSaveMsg('Layout guardado')
      setTimeout(() => setSaveMsg(null), 2500)
    },
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barra del editor */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-6 py-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          ← Tableros
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{dashboard.name}</p>
          {dashboard.description && (
            <p className="truncate text-xs text-gray-400">{dashboard.description}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saveMsg && <span className="text-xs text-emerald-600">{saveMsg}</span>}
          {saveMutation.isError && (
            <span className="text-xs text-red-600">{(saveMutation.error as Error).message}</span>
          )}
          <div className="relative">
            <button
              onClick={() => setShowChartPicker((v) => !v)}
              className="rounded-lg border border-iieg-300 px-3 py-1.5 text-xs font-medium text-iieg-700 hover:bg-iieg-50"
            >
              + Gráfica
            </button>
            {showChartPicker && (
              <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                {charts.length === 0 && (
                  <p className="p-3 text-xs text-gray-400">No hay gráficas guardadas.</p>
                )}
                {charts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addChart(c)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-gray-700 hover:bg-iieg-50"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1 text-gray-400">({c.chart_type})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={addText}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            + Texto
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-iieg-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar layout'}
          </button>
        </div>
      </div>

      {/* Grid drag-and-drop */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {draft.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            Agrega gráficas o textos para armar el tablero.
          </div>
        ) : (
          <Grid
            cols={12}
            rowHeight={80}
            margin={[12, 12]}
            layout={draft.map((d) => ({ i: d.key, ...d.layout, minW: 2, minH: 1 }))}
            onLayoutChange={onLayoutChange}
            draggableCancel=".no-drag"
          >
            {draft.map((d) => (
              <div
                key={d.key}
                className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
              >
                <button
                  onClick={() => removeItem(d.key)}
                  title="Quitar del tablero"
                  className="no-drag absolute right-1.5 top-1.5 z-10 hidden rounded-full bg-white/90 px-1.5 text-xs text-gray-400 shadow group-hover:block hover:text-red-600"
                >
                  ×
                </button>
                {d.itemType === 'chart' ? (
                  chartsById.get(d.chartId ?? '') ? (
                    <ChartWidget chart={chartsById.get(d.chartId!)!} />
                  ) : (
                    <p className="p-3 text-xs text-gray-400">Gráfica no disponible.</p>
                  )
                ) : (
                  <textarea
                    value={String(d.localConfig.content ?? '')}
                    onChange={(e) =>
                      setItems(
                        draft.map((x) =>
                          x.key === d.key
                            ? { ...x, localConfig: { ...x.localConfig, content: e.target.value } }
                            : x,
                        ),
                      )
                    }
                    className="no-drag h-full w-full resize-none rounded-lg border-0 bg-transparent p-2 text-sm text-gray-700 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </Grid>
        )}
      </div>
    </div>
  )
}

// ── Página principal: lista de tableros ───────────────────────────────────────

export function TablerosPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Dashboard | null>(null)
  const [newName, setNewName] = useState('')

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: listDashboards,
  })

  const createMutation = useMutation({
    mutationFn: () => createDashboard({ name: newName.trim() }),
    onSuccess: (dash) => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
      setNewName('')
      setEditing(dash)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  })

  if (editing) {
    return <DashboardEditor dashboard={editing} onBack={() => setEditing(null)} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Tableros</h1>
          <p className="text-sm text-gray-500">
            Arma tableros exploratorios con tus gráficas guardadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del tablero"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none"
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={!newName.trim() || createMutation.isPending}
            className="rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
          >
            Crear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-sm text-gray-400">Cargando tableros…</p>}
        {!isLoading && dashboards.length === 0 && (
          <p className="text-sm text-gray-400">Sin tableros; crea el primero arriba.</p>
        )}
        <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
          {dashboards.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow"
            >
              <p className="text-sm font-semibold text-gray-900">{d.name}</p>
              {d.description && <p className="mt-1 text-xs text-gray-500">{d.description}</p>}
              <p className="mt-1 text-xs text-gray-400">
                Actualizado: {new Date(d.updated_at).toLocaleDateString('es-MX')}
              </p>
              <div className="mt-3 flex gap-1.5">
                <button
                  onClick={() => setEditing(d)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Abrir
                </button>
                <button
                  onClick={() => deleteMutation.mutate(d.id)}
                  className="ml-auto rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
