import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getColumns, getSchema } from './api'
import type { ColumnInfo, Connection, SchemaObject } from '@/types/connections'

// ── Helpers ────────────────────────────────────────────────────────────────────

const OBJECT_TYPE_LABEL: Record<string, string> = {
  table: 'Tabla',
  view: 'Vista',
  materialized_view: 'Vista mat.',
}

const ENGINE_COLOR: Record<string, string> = {
  postgresql: '#336791',
  postgis: '#336791',
  duckdb: '#f0a500',
}

// ── Panel de columnas de un objeto ────────────────────────────────────────────

function ColumnRow({ col, i }: { col: ColumnInfo; i: number }) {
  return (
    <tr className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
      <td className="px-4 py-2 font-mono text-sm font-medium text-gray-800">{col.name}</td>
      <td className="px-4 py-2 text-sm text-gray-500">{col.data_type}</td>
      <td className="px-4 py-2">
        {col.nullable ? (
          <span className="text-xs text-gray-400">Sí</span>
        ) : (
          <span className="inline-flex rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">
            NO
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-gray-400">
        {col.default ?? <span className="italic">—</span>}
      </td>
    </tr>
  )
}

// ── Panel de detalle de objeto ─────────────────────────────────────────────────

function ObjectDetail({
  connectionId,
  obj,
}: {
  connectionId: string
  obj: { schema: string; name: string; type: string }
}) {
  const { data: columns, isFetching, error } = useQuery({
    queryKey: ['columns', connectionId, obj.schema, obj.name],
    queryFn: () => getColumns(connectionId, obj.schema, obj.name),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="flex flex-col">
      {/* Nombre y tipo */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <svg className="h-5 w-5 text-iieg-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 10h18M3 14h18M3 6h18M3 18h18" />
        </svg>
        <span className="text-base font-bold text-gray-900">{obj.name}</span>
        <span className="rounded-full bg-iieg-100 px-2.5 py-0.5 text-xs font-medium text-iieg-700">
          {OBJECT_TYPE_LABEL[obj.type] ?? obj.type}
        </span>
        {columns && (
          <span className="ml-auto text-xs text-gray-400">{columns.length} columnas</span>
        )}
      </div>

      {/* Columnas */}
      {isFetching && (
        <p className="px-5 py-6 text-sm text-gray-400">Cargando columnas…</p>
      )}
      {error && (
        <p className="px-5 py-4 text-sm text-red-600">{(error as Error).message}</p>
      )}
      {columns && columns.length === 0 && (
        <p className="px-5 py-6 text-sm italic text-gray-400">Sin columnas.</p>
      )}
      {columns && columns.length > 0 && (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {['Nombre', 'Tipo', 'Nulo', 'Default'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {columns.map((col, i) => (
                <ColumnRow key={col.name} col={col} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Fila de objeto en el árbol ─────────────────────────────────────────────────

interface SelectedObject {
  schema: string
  name: string
  type: string
}

function ObjectRow({
  schemaName,
  obj,
  selected,
  onSelect,
}: {
  schemaName: string
  obj: SchemaObject
  selected: boolean
  onSelect: (o: SelectedObject) => void
}) {
  return (
    <button
      onClick={() => onSelect({ schema: schemaName, name: obj.name, type: obj.type })}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        selected
          ? 'bg-iieg-100 text-iieg-800'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 10h18M3 14h18M3 6h18M3 18h18" />
      </svg>
      <span className="truncate font-mono">{obj.name}</span>
      {obj.type !== 'table' && (
        <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">
          {OBJECT_TYPE_LABEL[obj.type]}
        </span>
      )}
    </button>
  )
}

// ── Grupo de esquema ───────────────────────────────────────────────────────────

function SchemaGroupRow({
  connectionId,
  group,
  selectedObj,
  onSelect,
}: {
  connectionId: string
  group: { name: string; objects: SchemaObject[] }
  selectedObj: SelectedObject | null
  onSelect: (o: SelectedObject) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left"
      >
        <svg
          className={`h-3.5 w-3.5 flex-shrink-0 text-iieg-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="h-3.5 w-3.5 flex-shrink-0 text-iieg-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-xs font-semibold text-gray-700">{group.name}</span>
        <span className="ml-auto text-[10px] text-gray-400">{group.objects.length}</span>
      </button>

      {expanded && (
        <div className="ml-5 space-y-0.5">
          {group.objects.map((obj) => (
            <ObjectRow
              key={obj.name}
              schemaName={group.name}
              obj={obj}
              selected={selectedObj?.schema === group.name && selectedObj.name === obj.name}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Explorer principal ─────────────────────────────────────────────────────────

export function SchemaExplorer({ connection }: { connection: Connection }) {
  const [selectedObj, setSelectedObj] = useState<SelectedObject | null>(null)
  const [search, setSearch] = useState('')

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['schema', connection.id],
    queryFn: () => getSchema(connection.id),
    staleTime: 2 * 60 * 1000,
    retry: false,
  })

  const unsupported = connection.engine === 'duckdb'
  const iconColor = ENGINE_COLOR[connection.engine] ?? '#9a52ba'

  const filteredSchemas = data?.schemas.map((s) => ({
    ...s,
    objects: search
      ? s.objects.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
      : s.objects,
  }))

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Cabecera de conexión */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${iconColor}20` }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-gray-900">{connection.name}</p>
          <p className="text-xs text-gray-400">
            {connection.engine.charAt(0).toUpperCase() + connection.engine.slice(1)}
            {' · '}{connection.host}:{connection.port}{' · '}{connection.database}
          </p>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            connection.status === 'activa'
              ? 'bg-green-100 text-green-700'
              : connection.status === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Recargar esquema"
          className="flex-shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          <svg className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Área dividida: árbol | detalle */}
      <div className="flex flex-1 overflow-hidden">
        {/* Árbol de esquema */}
        <div className="flex w-64 flex-shrink-0 flex-col border-r border-gray-100">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2">
            <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar tabla o vista…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {unsupported && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                Exploración no disponible para conexiones DuckDB.
              </div>
            )}

            {!unsupported && isFetching && !data && (
              <p className="px-2 py-3 text-xs text-gray-400">Inspeccionando esquema…</p>
            )}

            {!unsupported && error && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                <p className="font-semibold">No se pudo inspeccionar el esquema</p>
                <p className="mt-1 text-red-500">{(error as Error).message}</p>
              </div>
            )}

            {!unsupported && filteredSchemas?.map((group) => (
              <SchemaGroupRow
                key={group.name}
                connectionId={connection.id}
                group={group}
                selectedObj={selectedObj}
                onSelect={setSelectedObj}
              />
            ))}
          </div>
        </div>

        {/* Panel de detalle */}
        <div className="flex-1 overflow-auto">
          {selectedObj ? (
            <ObjectDetail connectionId={connection.id} obj={selectedObj} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M3 10h18M3 14h18M3 6h18M3 18h18" />
              </svg>
              <p className="text-sm font-medium text-gray-400">Selecciona una tabla o vista</p>
              <p className="text-xs text-gray-300">para ver sus columnas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
