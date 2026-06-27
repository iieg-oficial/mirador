import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDatasets, deleteDataset, validateDataset } from './api'
import { SqlPlayground } from './SqlPlayground'
import { DatasetForm } from './DatasetForm'
import type { Dataset, DatasetStatus } from '@/types/datasets'

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

// ── Tabla de datasets guardados ───────────────────────────────────────────────

function DatasetList({
  onEdit,
  onPlayground,
}: {
  onEdit: (d: Dataset) => void
  onPlayground: (d: Dataset) => void
}) {
  const qc = useQueryClient()
  const { data: datasets = [], isLoading, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: listDatasets,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  })

  const validateMutation = useMutation({
    mutationFn: validateDataset,
    onSuccess: (updated) => {
      qc.setQueryData<Dataset[]>(['datasets'], (prev) =>
        prev?.map((d) => (d.id === updated.id ? updated : d)),
      )
    },
  })

  if (isLoading) return <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>
  if (error) return <p className="py-6 text-center text-sm text-red-600">Error al cargar datasets.</p>
  if (datasets.length === 0)
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No hay datasets guardados. Usa el playground para crear uno.
      </p>
    )

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Nombre</th>
            <th className="px-4 py-3 text-left font-medium">Estado</th>
            <th className="px-4 py-3 text-left font-medium">Slug</th>
            <th className="px-4 py-3 text-left font-medium">Máx. filas</th>
            <th className="px-4 py-3 text-left font-medium">Creado por</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {datasets.map((ds) => (
            <tr key={ds.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">
                {ds.name}
                {ds.description && (
                  <p className="text-xs font-normal text-gray-400 truncate max-w-xs">{ds.description}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={ds.status} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{ds.slug}</td>
              <td className="px-4 py-3 text-gray-600">
                {ds.max_rows.toLocaleString('es-MX')}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {ds.created_by_email ?? ds.created_by ?? '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onPlayground(ds)}
                    title="Abrir en playground"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-iieg-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                  </button>
                  {ds.status === 'draft' && (
                    <button
                      onClick={() => validateMutation.mutate(ds.id)}
                      disabled={validateMutation.isPending && validateMutation.variables === ds.id}
                      title="Validar SQL contra la BD"
                      className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(ds)}
                    title="Editar"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Archivar el dataset "${ds.name}"?`)) deleteMutation.mutate(ds.id)
                    }}
                    title="Archivar"
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M5.625 7.5h12.75" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = 'playground' | 'guardados'

export function DatasetsPage() {
  const [tab, setTab] = useState<Tab>('playground')
  const [formOpen, setFormOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null)
  const [prefill, setPrefill] = useState<{ connection_id: string; sql: string } | undefined>()

  function handleSaveFromPlayground(connectionId: string, sql: string) {
    setPrefill({ connection_id: connectionId, sql })
    setEditingDataset(null)
    setFormOpen(true)
  }

  function handleEdit(ds: Dataset) {
    setEditingDataset(ds)
    setPrefill(undefined)
    setFormOpen(true)
  }

  function handlePlayground(_ds: Dataset) {
    setTab('playground')
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingDataset(null)
    setPrefill(undefined)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Datasets</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Consultas SQL guardadas como fuente de datos para gráficas y dashboards.
          </p>
        </div>
        <button
          onClick={() => { setEditingDataset(null); setPrefill(undefined); setFormOpen(true) }}
          className="flex items-center gap-2 rounded-md bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuevo dataset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['playground', 'guardados'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-naranja-500 text-iieg-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'playground' ? 'Playground SQL' : 'Datasets guardados'}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'playground' ? (
        <SqlPlayground onSave={handleSaveFromPlayground} />
      ) : (
        <DatasetList onEdit={handleEdit} onPlayground={handlePlayground} />
      )}

      {/* Modal */}
      {formOpen && (
        <DatasetForm
          editing={editingDataset}
          prefill={prefill}
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}
