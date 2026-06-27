import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listConexiones, testConexion, deleteConexion } from './api'
import { ConexionForm } from './ConexionForm'
import { SchemaExplorer } from './SchemaExplorer'
import type { Connection, ConnectionStatus } from '@/types/connections'

// ── Semáforo ──────────────────────────────────────────────────────────────────

function Semaforo({
  status,
  testing,
}: {
  status: ConnectionStatus
  testing: boolean
}) {
  if (testing) {
    return (
      <span
        title="Probando conexión…"
        className="inline-block h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-amber-400"
      />
    )
  }
  const cls: Record<ConnectionStatus, string> = {
    activa: 'bg-green-500',
    inactiva: 'bg-gray-300',
    error: 'bg-red-500',
    archivada: 'bg-gray-200',
  }
  const labels: Record<ConnectionStatus, string> = {
    activa: 'Conexión activa',
    inactiva: 'Sin probar',
    error: 'Error de conexión',
    archivada: 'Archivada',
  }
  return (
    <span
      title={labels[status]}
      className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${cls[status]}`}
    />
  )
}

// ── Badge de motor ────────────────────────────────────────────────────────────

const ENGINE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  postgis: 'PostGIS',
  duckdb: 'DuckDB',
}

// ── Tarjeta de conexión ───────────────────────────────────────────────────────

function ConexionCard({
  connection,
  selected,
  testing,
  onSelect,
  onTest,
  onEdit,
  onDelete,
}: {
  connection: Connection
  selected: boolean
  testing: boolean
  onSelect: () => void
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-4 transition-all hover:shadow-sm ${
        selected
          ? 'border-iieg-500 bg-iieg-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Fila superior */}
      <div className="flex items-start gap-2.5">
        <Semaforo status={connection.status} testing={testing} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{connection.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {connection.host}:{connection.port}/{connection.database}
          </p>
        </div>
        <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
          {ENGINE_LABELS[connection.engine] ?? connection.engine}
        </span>
      </div>

      {/* Descripción */}
      {connection.description && (
        <p className="mt-2 text-xs text-gray-400 line-clamp-1">{connection.description}</p>
      )}

      {/* Error de última prueba */}
      {connection.status === 'error' && connection.last_test_error && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-600 line-clamp-2">
          {connection.last_test_error}
        </p>
      )}

      {/* Acciones */}
      <div
        className="mt-3 flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {confirmDelete ? (
          <>
            <span className="mr-1 text-xs text-red-600">¿Eliminar?</span>
            <button
              onClick={onDelete}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Confirmar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onTest}
              disabled={testing}
              title="Probar conexión"
              className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Probando…' : 'Probar'}
            </button>
            <button
              onClick={onEdit}
              title="Editar"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar"
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; connection: Connection } | null

export function ConexionesPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formState, setFormState] = useState<FormState>(null)

  const { data: conexiones, isLoading, error } = useQuery({
    queryKey: ['conexiones'],
    queryFn: listConexiones,
  })

  const testMutation = useMutation({
    mutationFn: testConexion,
    onSuccess: (result, id) => {
      qc.setQueryData<Connection[]>(['conexiones'], (prev) =>
        prev?.map((c) =>
          c.id === id ? { ...c, status: result.status, last_test_error: result.detail } : c,
        ),
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConexion,
    onSuccess: (_, id) => {
      qc.setQueryData<Connection[]>(['conexiones'], (prev) =>
        prev?.filter((c) => c.id !== id),
      )
      if (selectedId === id) setSelectedId(null)
    },
  })

  const visibles = conexiones?.filter((c) => c.status !== 'archivada') ?? []
  const selectedConnection = visibles.find((c) => c.id === selectedId) ?? null

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Conexiones a bases de datos</h1>
            <p className="text-xs text-gray-500">
              Fuentes de datos para crear datasets y visualizaciones
            </p>
          </div>
          <button
            onClick={() => setFormState({ mode: 'create' })}
            className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-3 py-2 text-sm font-medium text-white hover:bg-iieg-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva conexión
          </button>
        </div>

        {/* Contenido */}
        <div className="flex flex-1 overflow-hidden">
          {/* Lista de conexiones */}
          <div className="w-96 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-4">
            {isLoading && (
              <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0" />
                </svg>
                Cargando…
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {(error as Error).message}
              </div>
            )}

            {!isLoading && visibles.length === 0 && (
              <div className="py-12 text-center">
                <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <p className="text-sm font-medium text-gray-500">Sin conexiones</p>
                <p className="mt-1 text-xs text-gray-400">
                  Crea una conexión para comenzar
                </p>
                <button
                  onClick={() => setFormState({ mode: 'create' })}
                  className="mt-4 rounded-lg border border-iieg-300 px-3 py-1.5 text-xs font-medium text-iieg-700 hover:bg-iieg-50"
                >
                  Nueva conexión
                </button>
              </div>
            )}

            <div className="space-y-2">
              {visibles.map((conn) => (
                <ConexionCard
                  key={conn.id}
                  connection={conn}
                  selected={selectedId === conn.id}
                  testing={testMutation.isPending && testMutation.variables === conn.id}
                  onSelect={() => setSelectedId(conn.id === selectedId ? null : conn.id)}
                  onTest={() => testMutation.mutate(conn.id)}
                  onEdit={() => setFormState({ mode: 'edit', connection: conn })}
                  onDelete={() => deleteMutation.mutate(conn.id)}
                />
              ))}
            </div>
          </div>

          {/* Panel de exploración de esquema */}
          <div className="flex-1 overflow-hidden bg-white">
            {selectedConnection ? (
              <SchemaExplorer connection={selectedConnection} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <svg className="h-12 w-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-400">Explorador de esquema</p>
                  <p className="mt-0.5 text-xs text-gray-300">
                    Selecciona una conexión para ver sus tablas y vistas
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal del formulario */}
      {formState && (
        <ConexionForm
          editing={formState.mode === 'edit' ? formState.connection : null}
          onClose={() => setFormState(null)}
        />
      )}
    </>
  )
}
