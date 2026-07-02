import { useState, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { runPlayground } from './api'
import { listConexiones } from '@/features/connections/api'
import type { PreviewResult } from '@/types/datasets'

// ── Tabla de resultados ───────────────────────────────────────────────────────

function ResultTable({ result }: { result: PreviewResult }) {
  const { columns, rows, total_rows, truncated, elapsed_ms } = result

  return (
    <div className="flex flex-col gap-2">
      {/* Barra de estadísticas */}
      <div className="flex items-center gap-4 rounded-md bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
        <span>
          <span className="font-semibold text-gray-900">{rows.length}</span>
          {truncated && total_rows != null && (
            <span> de {total_rows.toLocaleString('es-MX')}</span>
          )}{' '}
          {total_rows != null && !truncated ? (
            <span>registros</span>
          ) : (
            <span>registros{truncated ? ' (muestra)' : ''}</span>
          )}
        </span>
        <span className="text-gray-300">|</span>
        <span>
          <span className="font-semibold text-gray-900">{columns.length}</span> columnas
        </span>
        <span className="text-gray-300">|</span>
        <span>{elapsed_ms.toLocaleString('es-MX')} ms</span>
        {truncated && (
          <>
            <span className="text-gray-300">|</span>
            <span className="font-medium text-amber-600">
              Resultado limitado — ajusta max_rows para ver más
            </span>
          </>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-auto rounded-md border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-700"
                >
                  <span>{col.name}</span>
                  <span className="ml-1 font-normal text-gray-400">{col.data_type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map((col) => {
                  const val = row[col.name]
                  return (
                    <td key={col.name} className="max-w-xs truncate px-3 py-1.5 text-gray-800">
                      {val == null ? (
                        <span className="italic text-gray-400">null</span>
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
          <p className="py-8 text-center text-sm text-gray-500">La consulta no devolvió registros.</p>
        )}
      </div>
    </div>
  )
}

// ── Playground principal ──────────────────────────────────────────────────────

interface SqlPlaygroundProps {
  /** Si se pasa, el playground fija la conexión y oculta el selector. */
  fixedConnectionId?: string
  /** SQL inicial (al editar un dataset existente). */
  initialSql?: string
  /** Callback cuando se quiere guardar el resultado como dataset. */
  onSave?: (connectionId: string, sql: string) => void
}

export function SqlPlayground({ fixedConnectionId, initialSql = '', onSave }: SqlPlaygroundProps) {
  const [connectionId, setConnectionId] = useState(fixedConnectionId ?? '')
  const [sql, setSql] = useState(initialSql)
  const [maxRows, setMaxRows] = useState(100)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: conexiones = [] } = useQuery({
    queryKey: ['conexiones'],
    queryFn: listConexiones,
    enabled: !fixedConnectionId,
  })

  const mutation = useMutation({
    mutationFn: () =>
      runPlayground({ connection_id: connectionId, sql, max_rows: maxRows }),
    onSuccess: (data) => setResult(data),
  })

  const canRun = connectionId && sql.trim().length > 0 && !mutation.isPending

  return (
    <div className="flex flex-col gap-4">
      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        {!fixedConnectionId && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Conexión</label>
            <select
              value={connectionId}
              onChange={(e) => { setConnectionId(e.target.value); setResult(null) }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-iieg-500 focus:outline-none"
            >
              <option value="">— selecciona conexión —</option>
              {conexiones
                .filter((c) => c.status !== 'archivada')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Máx. filas</label>
          <select
            value={maxRows}
            onChange={(e) => setMaxRows(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-iieg-500 focus:outline-none"
          >
            {[50, 100, 500, 1000, 5000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString('es-MX')} filas
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          {onSave && result && (
            <button
              onClick={() => onSave(connectionId, sql)}
              className="rounded-md border border-iieg-600 px-4 py-1.5 text-sm font-medium text-iieg-700 hover:bg-iieg-50"
            >
              Guardar como dataset
            </button>
          )}
          <button
            onClick={() => mutation.mutate()}
            disabled={!canRun}
            className="flex items-center gap-2 rounded-md bg-iieg-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-iieg-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mutation.isPending ? (
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

      {/* Editor SQL */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => { setSql(e.target.value); setResult(null) }}
          onKeyDown={(e) => {
            // Ctrl+Enter o Cmd+Enter para ejecutar
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              if (canRun) mutation.mutate()
            }
            // Tab → insertar 2 espacios
            if (e.key === 'Tab') {
              e.preventDefault()
              const start = e.currentTarget.selectionStart
              const end = e.currentTarget.selectionEnd
              const newSql = sql.substring(0, start) + '  ' + sql.substring(end)
              setSql(newSql)
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.selectionStart = start + 2
                  textareaRef.current.selectionEnd = start + 2
                }
              })
            }
          }}
          placeholder={
            connectionId
              ? 'SELECT *\nFROM esquema.tabla\nLIMIT 10\n\n-- Ctrl+Enter para ejecutar'
              : 'Selecciona una conexión para comenzar…'
          }
          disabled={!connectionId}
          rows={10}
          spellCheck={false}
          className="w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-sm leading-relaxed text-gray-900 placeholder-gray-400 focus:border-iieg-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        <span className="absolute bottom-2 right-3 text-xs text-gray-400 select-none">
          Ctrl+Enter para ejecutar · Tab para indentar
        </span>
      </div>

      {/* Error */}
      {mutation.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">Error: </span>
          {mutation.error instanceof Error ? mutation.error.message : 'Error desconocido'}
        </div>
      )}

      {/* Resultados */}
      {result && <ResultTable result={result} />}
    </div>
  )
}
