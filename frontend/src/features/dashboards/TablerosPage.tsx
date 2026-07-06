import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDashboard, deleteDashboard, listDashboards } from './api'
import { ErrorBanner } from '@/components/shared/ErrorBanner'
import { DASHBOARD_STATUS_LABELS } from '@/types/dashboards'
import type { DashboardRead, DashboardStatus } from '@/types/dashboards'

const STATUS_BADGE: Record<DashboardStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-400',
}

function CreateDashboardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (d: DashboardRead) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutationFn: () => createDashboard({ name: name.trim(), description: description.trim() || null }),
    onSuccess: onCreated,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <p className="mb-4 text-sm font-semibold text-gray-900">Nuevo tablero</p>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              Nombre<span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del tablero"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descripción opcional"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
            />
          </div>
        </div>

        {mutation.isError && <ErrorBanner error={mutation.error} compact small className="mt-2" />}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600 disabled:opacity-40"
          >
            {mutation.isPending ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

// DELETE /dashboards/{id} archiva (soft-delete): el backend pone status =
// "archived" y lo saca del listado, no lo borra. Por eso aquí solo hay una
// acción "Archivar" (con confirmación), no un borrado real.
function DashboardRow({
  dashboard,
  onOpen,
  onArchive,
  archiving,
}: {
  dashboard: DashboardRead
  onOpen: () => void
  onArchive: () => void
  archiving: boolean
}) {
  const [confirm, setConfirm] = useState(false)

  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-2.5">
        <p className="font-medium text-gray-800">{dashboard.name}</p>
        {dashboard.description && (
          <p className="text-xs text-gray-400 line-clamp-1">{dashboard.description}</p>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[dashboard.status]}`}>
          {DASHBOARD_STATUS_LABELS[dashboard.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">
        {new Date(dashboard.updated_at).toLocaleString('es-MX')}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">
        {dashboard.created_by_email ?? dashboard.created_by ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {confirm ? (
            <>
              <span className="text-xs text-red-600">¿Archivar?</span>
              <button
                onClick={onArchive}
                disabled={archiving}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onOpen}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Abrir
              </button>
              <button
                onClick={() => setConfirm(true)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Archivar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export function TablerosPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ['dashboards'],
    queryFn: listDashboards,
  })

  const archiveMutation = useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Tableros</h1>
          <p className="text-sm text-gray-500">
            Combina gráficas y texto en paneles configurables.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-iieg-700 px-4 py-2 text-sm font-medium text-white hover:bg-iieg-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo tablero
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-sm text-gray-400">Cargando tableros…</p>}

        {!isLoading && dashboards.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <svg className="h-12 w-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zM9 21h6M9 9h3v6H9zM15 12h0"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-500">Sin tableros</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Crea un tablero para combinar gráficas y texto en un mismo panel.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 rounded-lg border border-iieg-300 px-3 py-1.5 text-xs font-medium text-iieg-700 hover:bg-iieg-50"
            >
              Nuevo tablero
            </button>
          </div>
        )}

        {dashboards.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Actualizado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Autor</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dashboards.map((d) => (
                  <DashboardRow
                    key={d.id}
                    dashboard={d}
                    onOpen={() => navigate(`/admin/tableros/${d.id}`)}
                    onArchive={() => archiveMutation.mutate(d.id)}
                    archiving={archiveMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDashboardModal
          onClose={() => setShowCreate(false)}
          onCreated={(d) => {
            qc.invalidateQueries({ queryKey: ['dashboards'] })
            setShowCreate(false)
            navigate(`/admin/tableros/${d.id}`)
          }}
        />
      )}
    </div>
  )
}
