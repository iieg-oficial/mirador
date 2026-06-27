import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getColumns, getSchema } from './api'
import type { ColumnInfo, Connection, SchemaObject } from '@/types/connections'

const OBJECT_TYPE_LABEL: Record<string, string> = {
  table: 'Tabla',
  view: 'Vista',
  materialized_view: 'Vista mat.',
}

const OBJECT_TYPE_ICON: Record<string, string> = {
  table: '▦',
  view: '⊞',
  materialized_view: '⊡',
}

function ColumnRow({ col }: { col: ColumnInfo }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-0.5 text-xs">
      <span className="font-mono text-gray-700">{col.name}</span>
      <span className="text-gray-400">{col.data_type}</span>
      {!col.nullable && (
        <span className="rounded bg-orange-50 px-1 text-[10px] font-medium text-orange-600">
          NOT NULL
        </span>
      )}
    </div>
  )
}

function ObjectRow({
  connectionId,
  schemaName,
  obj,
}: {
  connectionId: string
  schemaName: string
  obj: SchemaObject
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: columns, isFetching, error } = useQuery({
    queryKey: ['columns', connectionId, schemaName, obj.name],
    queryFn: () => getColumns(connectionId, schemaName, obj.name),
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-300 w-3 flex-shrink-0">{expanded ? '▾' : '▸'}</span>
        <span className="text-gray-400 flex-shrink-0">{OBJECT_TYPE_ICON[obj.type]}</span>
        <span className="font-mono text-gray-700 truncate">{obj.name}</span>
        <span className="ml-auto flex-shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-400">
          {OBJECT_TYPE_LABEL[obj.type]}
        </span>
      </button>

      {expanded && (
        <div className="border-l border-gray-100 ml-6">
          {isFetching && (
            <p className="px-3 py-1 text-xs text-gray-400 italic">Cargando columnas…</p>
          )}
          {error && (
            <p className="px-3 py-1 text-xs text-red-500">
              {(error as Error).message}
            </p>
          )}
          {columns?.length === 0 && (
            <p className="px-3 py-1 text-xs text-gray-400 italic">Sin columnas</p>
          )}
          {columns?.map((col) => <ColumnRow key={col.name} col={col} />)}
        </div>
      )}
    </div>
  )
}

function SchemaGroupRow({
  connectionId,
  group,
}: {
  connectionId: string
  group: { name: string; objects: SchemaObject[] }
}) {
  const [expanded, setExpanded] = useState(true)

  const tables = group.objects.filter((o) => o.type === 'table')
  const views = group.objects.filter((o) => o.type === 'view')
  const matViews = group.objects.filter((o) => o.type === 'materialized_view')

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold text-iieg-700 hover:bg-iieg-50 transition-colors rounded"
      >
        <span className="text-iieg-400">{expanded ? '▾' : '▸'}</span>
        <span>{group.name}</span>
        <span className="ml-auto text-[10px] font-normal text-gray-400">
          {group.objects.length} obj.
        </span>
      </button>

      {expanded && (
        <div className="ml-2">
          {tables.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Tablas ({tables.length})
              </p>
              {tables.map((obj) => (
                <ObjectRow
                  key={obj.name}
                  connectionId={connectionId}
                  schemaName={group.name}
                  obj={obj}
                />
              ))}
            </div>
          )}
          {views.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Vistas ({views.length})
              </p>
              {views.map((obj) => (
                <ObjectRow
                  key={obj.name}
                  connectionId={connectionId}
                  schemaName={group.name}
                  obj={obj}
                />
              ))}
            </div>
          )}
          {matViews.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Vistas materializadas ({matViews.length})
              </p>
              {matViews.map((obj) => (
                <ObjectRow
                  key={obj.name}
                  connectionId={connectionId}
                  schemaName={group.name}
                  obj={obj}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SchemaExplorer({ connection }: { connection: Connection }) {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['schema', connection.id],
    queryFn: () => getSchema(connection.id),
    staleTime: 2 * 60 * 1000,
    retry: false,
  })

  const unsupported = connection.engine === 'duckdb'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800">{connection.name}</p>
          <p className="text-xs text-gray-400">
            {connection.engine} · {connection.database}
          </p>
        </div>
        {!unsupported && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Recargar esquema"
            className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <svg className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-2">
        {unsupported && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            La exploración de esquema no está disponible para conexiones DuckDB.
          </div>
        )}

        {!unsupported && isFetching && !data && (
          <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0" />
            </svg>
            Inspeccionando esquema…
          </div>
        )}

        {!unsupported && error && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <p className="font-semibold">No se pudo inspeccionar el esquema</p>
            <p className="mt-1 text-red-500">{(error as Error).message}</p>
            <p className="mt-2 text-red-400">
              Asegúrate de que la conexión es válida (prueba la conexión primero).
            </p>
          </div>
        )}

        {!unsupported && data?.schemas.length === 0 && (
          <p className="p-3 text-xs text-gray-400 italic">No se encontraron esquemas.</p>
        )}

        {!unsupported && data?.schemas.map((group) => (
          <SchemaGroupRow key={group.name} connectionId={connection.id} group={group} />
        ))}
      </div>
    </div>
  )
}
