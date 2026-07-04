import CodeMirror from '@uiw/react-codemirror'
import type { ColumnMeta } from '@/types/datasets'

// Sandbox de la gráfica (modo Avanzado): en lugar de editar la ChartSpec JSON,
// el usuario escribe JavaScript con ECharts. El código recibe `rows` (las filas
// del dataset precargado) y `echarts` (el módulo) y debe `return` un objeto
// `option`. Se ejecuta en ChartRenderer (`new Function`). Herramienta interna de
// análisis de datos internos: sin aislamiento — el código corre en el navegador
// del propio autor.

interface SandboxEditorProps {
  value: string
  onChange: (code: string) => void
  /** Columnas del dataset, para mostrar los nombres disponibles en `rows`. */
  columns: ColumnMeta[]
}

export function SandboxEditor({ value, onChange, columns }: SandboxEditorProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-gray-100 bg-white px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Código (JavaScript · ECharts)
        </p>
        <p className="mt-1 text-[11px] text-gray-500">
          Recibes <code className="rounded bg-gray-100 px-1">rows</code> (filas del dataset) y{' '}
          <code className="rounded bg-gray-100 px-1">echarts</code>. Devuelve con{' '}
          <code className="rounded bg-gray-100 px-1">return</code> un objeto{' '}
          <code className="rounded bg-gray-100 px-1">option</code>. Pulsa «Actualizar vista» para
          ejecutar.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          onChange={onChange}
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
                title={`Insertar r['${c.name}']`}
                onClick={() => onChange(`${value}\n// r['${c.name}']`)}
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
