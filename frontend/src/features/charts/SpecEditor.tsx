import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { validateSpec } from './api'
import type { ChartValidation } from './api'
import { applyOverrides, buildOption } from './ChartRenderer'
import type { ChartSpec } from '@/types/charts'

// Editor avanzado de ChartSpec (RF-04): JSON con resaltado, validación contra
// el backend, formateo, restauración de la última versión válida y paneles de
// solo lectura con la consulta generada (RF-08) y el EChartsOption (RF-09).
// No ejecuta JavaScript ni SQL libre: solo edita la spec declarativa (RNF-01).

interface SpecEditorProps {
  initial: ChartSpec
  /** Se dispara en cada edición: spec parseada o null si el JSON es inválido. */
  onSpecChange: (spec: ChartSpec | null) => void
  /** SQL generada por el último preview (solo lectura). */
  generatedSql: string | null
  /** Filas del último preview, para materializar el EChartsOption generado. */
  previewRows: Record<string, unknown>[] | null
}

function tryParse(text: string): { spec: ChartSpec | null; error: string | null } {
  try {
    return { spec: JSON.parse(text) as ChartSpec, error: null }
  } catch (err) {
    return { spec: null, error: `JSON inválido: ${(err as Error).message}` }
  }
}

export function SpecEditor({ initial, onSpecChange, generatedSql, previewRows }: SpecEditorProps) {
  const initialText = useMemo(() => JSON.stringify(initial, null, 2), [initial])
  const [text, setText] = useState(initialText)
  const [lastValid, setLastValid] = useState(initialText)
  const [parseError, setParseError] = useState<string | null>(null)
  const [validation, setValidation] = useState<ChartValidation | null>(null)
  const [validating, setValidating] = useState(false)

  function handleChange(value: string) {
    setText(value)
    setValidation(null)
    const { spec, error } = tryParse(value)
    setParseError(error)
    if (spec) {
      setLastValid(value)
      onSpecChange(spec)
    } else {
      onSpecChange(null)
    }
  }

  function handleFormat() {
    const { spec } = tryParse(text)
    if (spec) setText(JSON.stringify(spec, null, 2))
  }

  function handleRestore() {
    handleChange(lastValid)
  }

  async function handleValidate() {
    const { spec, error } = tryParse(text)
    if (!spec) {
      setValidation({ valid: false, errors: [error ?? 'JSON inválido'], warnings: [] })
      return
    }
    setValidating(true)
    try {
      setValidation(await validateSpec(spec))
    } catch (err) {
      setValidation({ valid: false, errors: [(err as Error).message], warnings: [] })
    } finally {
      setValidating(false)
    }
  }

  // EChartsOption generado (solo tipos ECharts; table/kpi son componentes React).
  const optionJson = useMemo(() => {
    const { spec } = tryParse(text)
    if (!spec || !previewRows) return null
    const t = spec.visual?.chart_type
    if (t === 'table' || t === 'kpi') return null
    try {
      // Con los overrides ya aplicados, para ver el efecto real (Fase 5).
      return JSON.stringify(applyOverrides(buildOption(spec, previewRows), spec), null, 2)
    } catch {
      return null
    }
  }, [text, previewRows])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barra de acciones */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2">
        <p className="mr-auto text-xs font-bold uppercase tracking-wider text-gray-400">
          ChartSpec (JSON)
        </p>
        <button
          type="button"
          onClick={handleValidate}
          disabled={validating}
          className="rounded-lg border border-iieg-300 px-2.5 py-1 text-xs font-medium text-iieg-700 hover:bg-iieg-50 disabled:opacity-40"
        >
          {validating ? 'Validando…' : 'Validar'}
        </button>
        <button
          type="button"
          onClick={handleFormat}
          disabled={!!parseError}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Formatear
        </button>
        <button
          type="button"
          onClick={handleRestore}
          disabled={text === lastValid}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Restaurar última válida
        </button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={text}
          onChange={handleChange}
          extensions={[json()]}
          basicSetup={{ foldGutter: true, lineNumbers: true }}
          style={{ fontSize: 12, height: '100%' }}
        />
      </div>

      {/* Mensajes de validación */}
      <div className="max-h-56 space-y-2 overflow-y-auto border-t border-gray-100 bg-white p-3">
        {parseError && (
          <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{parseError}</div>
        )}
        {validation && !validation.valid && (
          <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
            <p className="font-semibold">La spec no es válida:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {validation.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {validation?.valid && (
          <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
            La spec es válida y ejecutable.
          </div>
        )}
        {validation && validation.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            <ul className="list-inside list-disc space-y-0.5">
              {validation.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Consulta generada (RF-08): visible, nunca editable */}
        {generatedSql && (
          <details className="rounded-lg border border-gray-100">
            <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-gray-600">
              SQL generada (solo lectura)
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap border-t border-gray-100 bg-gray-50 p-2 text-[11px] text-gray-700">
              {generatedSql}
            </pre>
          </details>
        )}

        {/* EChartsOption generado (RF-09): referencia técnica */}
        {optionJson && (
          <details className="rounded-lg border border-gray-100">
            <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-gray-600">
              EChartsOption generado (solo lectura)
            </summary>
            <pre className="max-h-48 overflow-auto border-t border-gray-100 bg-gray-50 p-2 text-[11px] text-gray-700">
              {optionJson}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
