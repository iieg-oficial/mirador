import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { listConexiones } from '@/features/connections/api'
import { downloadCsv } from '@/lib/csv'
import { listDatasets, deleteDataset, runPlayground } from './api'
import { DatasetForm } from './DatasetForm'
import { TagBadge } from '@/components/shared/TagBadge'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { TagFilterBar } from '@/features/tags/TagFilterBar'
import type { Dataset, DatasetStatus, PreviewResult } from '@/types/datasets'

// ── Badge de estado ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DatasetStatus }) {
  const styles: Record<DatasetStatus, string> = {
    draft: 'bg-gray-100 text-gray-600',
    validated: 'bg-blue-100 text-blue-700',
    published: 'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-400',
  }
  const labels: Record<DatasetStatus, string> = {
    draft: 'Borrador',
    validated: 'Validado',
    published: 'Publicado',
    archived: 'Archivado',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// ── Tabla de resultados ───────────────────────────────────────────────────────

function ResultTable({ result }: { result: PreviewResult }) {
  const { columns, rows, total_rows, truncated, elapsed_ms } = result

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-100">
      <div className="flex items-center gap-6 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
        {[
          { value: total_rows != null ? total_rows.toLocaleString('es-MX') : rows.length, label: 'Registros totales' },
          { value: columns.length, label: 'Columnas' },
          { value: `${elapsed_ms.toLocaleString('es-MX')} ms`, label: 'Tiempo de ejecución' },
          { value: rows.length, label: 'Filas mostradas' },
        ].map(({ value, label }) => (
          <div key={label}>
            <p className="text-sm font-bold text-gray-900">{value}</p>
            <p className="text-[11px] text-gray-400">{label}</p>
          </div>
        ))}
        {truncated && (
          <span className="ml-auto text-xs font-medium text-amber-600">Resultado limitado</span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100">
              {columns.map((col) => (
                <th key={col.name} className="whitespace-nowrap px-4 py-2.5 text-left">
                  <span className="text-xs font-semibold text-gray-700">{col.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/60">
                {columns.map((col) => {
                  const val = row[col.name]
                  return (
                    <td key={col.name} className="max-w-xs truncate px-4 py-2 text-xs text-gray-700">
                      {val == null ? (
                        <span className="italic text-gray-300">null</span>
                      ) : typeof val === 'object' ? (
                        <span className="font-mono text-gray-500">{JSON.stringify(val)}</span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">La consulta no devolvió registros.</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
        <span className="text-xs text-gray-400">
          Mostrando {rows.length}
          {total_rows != null ? ` de ${total_rows.toLocaleString('es-MX')} registros` : ' registros'}
        </span>
        <button
          onClick={() =>
            downloadCsv(
              'resultado_consulta',
              columns.map((c) => c.name),
              rows,
            )
          }
          disabled={rows.length === 0}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Descargar CSV
        </button>
      </div>
    </div>
  )
}

// ── Lista de datasets ─────────────────────────────────────────────────────────

function DatasetList({
  onEdit,
  onOpenInPlayground,
}: {
  onEdit: (d: Dataset) => void
  onOpenInPlayground: (d: Dataset) => void
}) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(timer)
  }, [q])

  const { data: datasets = [], isLoading, error } = useQuery({
    queryKey: ['datasets', debouncedQ, tagIds],
    queryFn: () => listDatasets({ q: debouncedQ, tagIds }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar dataset…"
          className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
        />
        <TagFilterBar value={tagIds} onChange={setTagIds} />
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-gray-400">Cargando…</p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-red-600">Error al cargar datasets.</p>
      ) : datasets.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <svg className="h-12 w-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-500">Sin datasets guardados</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Ve al Playground SQL, escribe una consulta y guárdala como dataset.
            </p>
          </div>
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-100">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Nombre</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold">Slug</th>
            <th className="px-4 py-3 text-left font-semibold">Máx. filas</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {datasets.map((ds) => (
            <tr key={ds.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-3 font-medium text-gray-900">
                {ds.name}
                {ds.description && (
                  <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-gray-400">
                    {ds.description}
                  </p>
                )}
                {ds.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ds.tags.map((t) => (
                      <TagBadge key={t.id} tag={t} />
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3"><StatusBadge status={ds.status} /></td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{ds.slug}</td>
              <td className="px-4 py-3 text-gray-600">{ds.max_rows.toLocaleString('es-MX')}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {/* Abrir en playground con el SQL pre-cargado */}
                  <button
                    onClick={() => onOpenInPlayground(ds)}
                    title="Abrir en Playground"
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-iieg-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Playground
                  </button>
                  <button
                    onClick={() => onEdit(ds)}
                    title="Editar"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Archivar el dataset "${ds.name}"?`)) deleteMutation.mutate(ds.id)
                    }}
                    title="Archivar"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M5.625 7.5h12.75" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
    </div>
  )
}

// ── Playground SQL ────────────────────────────────────────────────────────────

interface PlaygroundState {
  connectionId: string
  sql: string
  maxRows: number
}

function Playground({
  initial,
  onSaved,
}: {
  initial: PlaygroundState
  onSaved: () => void
}) {
  const [connectionId, setConnectionId] = useState(initial.connectionId)
  const [sql, setSql] = useState(initial.sql)
  const [maxRows, setMaxRows] = useState(initial.maxRows)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: conexiones = [] } = useQuery({
    queryKey: ['conexiones'],
    queryFn: () => listConexiones(),
  })

  const runMutation = useMutation({
    mutationFn: () => runPlayground({ connection_id: connectionId, sql, max_rows: maxRows }),
    onSuccess: (data) => setResult(data),
  })

  const canRun = !!connectionId && sql.trim().length > 0 && !runMutation.isPending
  const activeConnection = conexiones.find((c) => c.id === connectionId)

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Controles */}
        <div className="flex items-end gap-4 border-b border-gray-100 bg-white px-6 py-4">
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Conexión</label>
            <select
              value={connectionId}
              onChange={(e) => { setConnectionId(e.target.value); setResult(null) }}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
            >
              <option value="">— Seleccionar —</option>
              {conexiones
                .filter((c) => c.status !== 'archivada')
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            {activeConnection && (
              <p className="mt-1 truncate text-[11px] text-gray-400">
                {activeConnection.engine} · {activeConnection.database}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Máx. filas</label>
            <select
              value={maxRows}
              onChange={(e) => setMaxRows(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
            >
              {[50, 100, 500, 1000, 5000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString('es-MX')} filas</option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setFormOpen(true)}
              disabled={!result}
              className="flex items-center gap-1.5 rounded-lg border border-iieg-300 px-3 py-2 text-sm font-medium text-iieg-700 hover:bg-iieg-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 16v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2h2m3-4H9a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-1m-1 4l-3 3m0 0l-3-3m3 3V3" />
              </svg>
              Guardar como dataset
            </button>
            <button
              onClick={() => runMutation.mutate()}
              disabled={!canRun}
              className="flex items-center gap-2 rounded-lg bg-iieg-700 px-4 py-2 text-sm font-semibold text-white hover:bg-iieg-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {runMutation.isPending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Ejecutando…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
                  </svg>
                  Ejecutar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Editor | Resultados */}
        <div className="flex flex-1 overflow-hidden">
          {/* Editor SQL */}
          <div className="flex w-96 flex-shrink-0 flex-col border-r border-gray-100 bg-white">
            <div className="border-b border-gray-100 px-4 py-2.5">
              <span className="text-xs font-semibold text-gray-700">Query SQL</span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <textarea
                value={sql}
                onChange={(e) => { setSql(e.target.value); setResult(null) }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    if (canRun) runMutation.mutate()
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const start = e.currentTarget.selectionStart
                    const end = e.currentTarget.selectionEnd
                    const newSql = sql.substring(0, start) + '  ' + sql.substring(end)
                    setSql(newSql)
                    requestAnimationFrame(() => {
                      const el = e.currentTarget
                      el.selectionStart = start + 2
                      el.selectionEnd = start + 2
                    })
                  }
                }}
                placeholder={
                  connectionId
                    ? 'SELECT *\nFROM esquema.tabla\nLIMIT 10\n\n-- Ctrl+Enter para ejecutar'
                    : 'Selecciona una conexión para comenzar…'
                }
                disabled={!connectionId}
                spellCheck={false}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50/60 p-3 font-mono text-sm leading-relaxed text-gray-900 placeholder-gray-400 focus:border-iieg-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-iieg-400 disabled:bg-gray-50 disabled:text-gray-400"
                style={{ minHeight: '280px' }}
              />
              <p className="mt-2 text-xs text-gray-400">
                <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">Ctrl+Enter</kbd> ejecuta ·{' '}
                <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">Tab</kbd> indenta
              </p>
            </div>
          </div>

          {/* Resultados */}
          <div className="flex flex-1 flex-col overflow-hidden bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">Resultado</span>
              {runMutation.isSuccess && (
                <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  OK
                </span>
              )}
            </div>

            {!result && !runMutation.isPending && !runMutation.isError && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <svg className="h-12 w-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">Ejecuta una consulta para ver los resultados</p>
              </div>
            )}

            {runMutation.isPending && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-iieg-600" />
                Ejecutando consulta…
              </div>
            )}

            {runMutation.isError && (
              <ErrorBanner
                error={runMutation.error}
                fallback="Error desconocido"
                title="Error al ejecutar la consulta"
              />
            )}

            {result && <ResultTable result={result} />}
          </div>
        </div>
      </div>

      {formOpen && (
        <DatasetForm
          editing={null}
          prefill={{ connection_id: connectionId, sql }}
          onClose={() => {
            setFormOpen(false)
            onSaved()
          }}
        />
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = 'list' | 'playground'

export function DatasetsPage() {
  const [tab, setTab] = useState<Tab>('list')
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null)
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [playgroundKey, setPlaygroundKey] = useState(0)
  const [playgroundInit, setPlaygroundInit] = useState<PlaygroundState>({
    connectionId: '',
    sql: '',
    maxRows: 100,
  })

  function openPlayground(ds?: Dataset) {
    setPlaygroundInit(
      ds
        ? { connectionId: ds.connection_id, sql: ds.sql_query, maxRows: ds.max_rows }
        : { connectionId: '', sql: '', maxRows: 100 },
    )
    setPlaygroundKey((k) => k + 1)
    setTab('playground')
  }

  function openEdit(ds: Dataset) {
    setEditingDataset(ds)
    setEditFormOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Datasets</h1>
          <p className="text-sm text-gray-500">
            Consultas SQL guardadas como fuente de datos para gráficas y tableros.
          </p>
        </div>
        {tab === 'list' && (
          <button
            onClick={() => openPlayground()}
            className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo dataset
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-100 bg-white px-6">
        <button
          onClick={() => setTab('list')}
          className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
            tab === 'list'
              ? 'border-iieg-600 text-iieg-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Mis datasets
        </button>
        <button
          onClick={() => tab !== 'playground' && openPlayground()}
          className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
            tab === 'playground'
              ? 'border-iieg-600 text-iieg-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Playground SQL
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-hidden">
        {tab === 'list' && (
          <div className="h-full overflow-y-auto p-6">
            <DatasetList
              onEdit={openEdit}
              onOpenInPlayground={openPlayground}
            />
          </div>
        )}

        {tab === 'playground' && (
          <Playground
            key={playgroundKey}
            initial={playgroundInit}
            onSaved={() => setTab('list')}
          />
        )}
      </div>

      {/* Modal edición */}
      {editFormOpen && (
        <DatasetForm
          editing={editingDataset}
          prefill={undefined}
          onClose={() => {
            setEditFormOpen(false)
            setEditingDataset(null)
          }}
        />
      )}
    </div>
  )
}
