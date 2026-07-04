import { useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import type { CodeEngine } from '@/types/charts'
import type { ColumnMeta } from '@/types/datasets'

// Sandbox de la gráfica (modo Avanzado): en lugar de editar la ChartSpec JSON,
// el usuario escribe código que recibe `rows` (las filas del dataset precargado)
// y produce la visualización. Dos motores:
//   - echarts: JavaScript, `return` un objeto `option` (corre con new Function).
//   - plotly:  Python (Pyodide en el navegador), define una variable `fig`.
// Herramienta interna de análisis de datos internos: sin aislamiento — el
// código corre en el navegador del propio autor.

interface SandboxEditorProps {
  value: string
  onChange: (code: string) => void
  /** Ejecuta el código y refresca la vista previa (botón y Ctrl/Cmd+Enter). */
  onRun: () => void
  /** Columnas del dataset, para mostrar los nombres disponibles en `rows`. */
  columns: ColumnMeta[]
  /** Motor de la gráfica de código: define lenguaje, ayuda y renderer. */
  engine: CodeEngine
  onEngineChange: (engine: CodeEngine) => void
}

const ENGINES: { id: CodeEngine; label: string }[] = [
  { id: 'echarts', label: 'ECharts · JS' },
  { id: 'plotly', label: 'Plotly · Python' },
]

export function SandboxEditor({
  value,
  onChange,
  onRun,
  columns,
  engine,
  onEngineChange,
}: SandboxEditorProps) {
  // Ref para que el atajo Ctrl/Cmd+Enter no recree la extensión de CodeMirror
  // en cada render (onRun cambia de identidad al re-renderizar el builder).
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun
  const extensions = useMemo(
    () => [
      engine === 'plotly' ? python() : javascript({ typescript: true }),
      Prec.highest(
        keymap.of([{ key: 'Mod-Enter', run: () => (onRunRef.current(), true) }]),
      ),
    ],
    [engine],
  )

  const comment = engine === 'plotly' ? '#' : '//'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-gray-100 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="mr-auto flex items-center gap-1">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEngineChange(e.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  engine === e.id
                    ? 'bg-iieg-100 text-iieg-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRun}
            title="Ejecutar (Ctrl/Cmd + Enter)"
            className="rounded-lg bg-iieg-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-iieg-600"
          >
            Ejecutar ▸
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {engine === 'plotly' ? (
            <>
              Recibes <code className="rounded bg-gray-100 px-1">rows</code> (lista de dicts).
              Deja la figura de Plotly en una variable{' '}
              <code className="rounded bg-gray-100 px-1">fig</code>. Disponibles{' '}
              <code className="rounded bg-gray-100 px-1">pandas</code> y{' '}
              <code className="rounded bg-gray-100 px-1">plotly.express</code>; la primera
              ejecución descarga el runtime de Python (tarda un poco).
            </>
          ) : (
            <>
              Recibes <code className="rounded bg-gray-100 px-1">rows</code> (filas del dataset) y{' '}
              <code className="rounded bg-gray-100 px-1">echarts</code>. Devuelve con{' '}
              <code className="rounded bg-gray-100 px-1">return</code> un objeto{' '}
              <code className="rounded bg-gray-100 px-1">option</code>.
            </>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          basicSetup={{ foldGutter: true, lineNumbers: true }}
          style={{ fontSize: 12, height: '100%' }}
        />
      </div>

      {columns.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t border-gray-100 bg-white p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-gray-500">
            Columnas disponibles en <code className="rounded bg-gray-100 px-1">rows</code>
          </p>
          <div className="flex flex-wrap gap-1">
            {columns.map((c) => (
              <button
                key={c.name}
                type="button"
                title={`Insertar ${comment} r['${c.name}']`}
                onClick={() => onChange(`${value}\n${comment} r['${c.name}']`)}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-600 hover:bg-iieg-50 hover:text-iieg-700"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
