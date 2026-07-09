import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { generateQuerySql } from './api'
import { ErrorBanner } from '@/components/shared/ErrorBanner'

interface Props {
  connectionId: string
  currentSql: string
  onGenerated: (sql: string, explanation?: string) => void
}

export function AiQueryAssistant({ connectionId, currentSql, onGenerated }: Props) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [lastExplanation, setLastExplanation] = useState<string | undefined>(undefined)

  const generateMutation = useMutation({
    mutationFn: () =>
      generateQuerySql(
        connectionId,
        prompt,
        currentSql.trim().length > 0 ? currentSql : undefined,
      ),
    onSuccess: (data) => {
      setLastExplanation(data.explanation)
      onGenerated(data.sql, data.explanation)
    },
  })

  const canGenerate = !!connectionId && prompt.trim().length > 0 && !generateMutation.isPending

  return (
    <div className="mb-3 rounded-lg border border-iieg-100 bg-iieg-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-iieg-700"
      >
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m0 12.728l.707-.707M6.343 6.343l.707.707M17.657 6.343l-.707.707M12 8a4 4 0 00-4 4c0 1.5.8 2.5 2 3.5V17h4v-1.5c1.2-1 2-2 2-3.5a4 4 0 00-4-4z" />
          </svg>
          Asistente de IA
        </span>
        <span>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-iieg-100 px-3 py-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe la consulta que necesitas, ej: ventas totales por mes del último año"
            className="w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-900 placeholder-gray-400 focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400"
          />

          <div className="mt-2 flex items-center justify-between">
            <p className="flex items-center gap-1 text-[11px] text-amber-600">
              <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a1.5 1.5 0 001.29 2.25h17.78a1.5 1.5 0 001.29-2.25L13.71 3.86a1.5 1.5 0 00-2.42 0z" />
              </svg>
              La IA puede equivocarse, revisa la consulta antes de ejecutarla
            </p>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-iieg-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-iieg-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generateMutation.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generando…
                </>
              ) : (
                'Generar con IA'
              )}
            </button>
          </div>

          {generateMutation.isError && (
            <ErrorBanner
              error={generateMutation.error}
              fallback="No se pudo generar la consulta"
              title="Error del asistente de IA"
              small
              className="mt-2"
            />
          )}

          {generateMutation.isSuccess && lastExplanation && (
            <p className="mt-2 text-[11px] text-gray-500">{lastExplanation}</p>
          )}
        </div>
      )}
    </div>
  )
}
