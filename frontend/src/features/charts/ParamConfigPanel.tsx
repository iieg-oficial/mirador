// Panel de autoría de parámetros interactivos del modo avanzado (ChartSpec.params).
// Modelado sobre FilterConfigPanel.tsx (filtros globales de tablero): misma idea
// de edición en lista, pero las opciones de "select"/"multiselect" solo pueden
// venir de una columna del dataset ya elegido o de una lista estática — no hay
// dataset externo, el param vive dentro de una sola gráfica.

import { PARAM_CONTROL_LABELS, type ParamControl, type ParamOption, type ParamSpec } from '@/types/charts'
import type { ColumnMeta } from '@/types/datasets'

interface Props {
  params: ParamSpec[]
  onChange: (params: ParamSpec[]) => void
  columns: ColumnMeta[]
}

const fieldCls =
  'w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400'

const USES_OPTIONS: ParamControl[] = ['select', 'multiselect', 'radio']
const USES_RANGE: ParamControl[] = ['slider', 'number']

function optionsToText(options: ParamOption[]): string {
  return options.map((o) => (o.label === String(o.value) ? String(o.value) : `${o.value}|${o.label}`)).join('\n')
}
function textToOptions(text: string): ParamOption[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [value, label] = l.split('|')
      return { value: value.trim(), label: (label ?? value).trim() }
    })
}

function newParam(index: number): ParamSpec {
  return { id: `param_${index + 1}`, label: `Parámetro ${index + 1}`, control: 'select', options: [] }
}

export function ParamConfigPanel({ params, onChange, columns }: Props) {
  const patch = (i: number, p: Partial<ParamSpec>) =>
    onChange(params.map((param, j) => (j === i ? { ...param, ...p } : param)))

  return (
    <div className="space-y-3">
      {params.map((p, i) => {
        const usesOptions = USES_OPTIONS.includes(p.control)
        const usesRange = USES_RANGE.includes(p.control)
        return (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-2">
            <div className="flex items-center gap-1">
              <input
                value={p.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="Nombre visible"
                className={fieldCls}
              />
              <button
                type="button"
                onClick={() => onChange(params.filter((_, j) => j !== i))}
                className="rounded px-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>

            <div className="flex gap-1">
              <input
                value={p.id}
                onChange={(e) => patch(i, { id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
                placeholder="id (variable)"
                className={fieldCls}
                title="Nombre con el que se lee en el sandbox: params.<id>"
              />
              <select
                value={p.control}
                onChange={(e) => patch(i, { control: e.target.value as ParamControl })}
                className={fieldCls}
              >
                {(Object.keys(PARAM_CONTROL_LABELS) as ParamControl[]).map((t) => (
                  <option key={t} value={t}>
                    {PARAM_CONTROL_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {usesOptions && (
              <div className="space-y-1 rounded bg-gray-50 p-1.5">
                <select
                  value={p.options_from_column ?? ''}
                  onChange={(e) => patch(i, { options_from_column: e.target.value || null })}
                  className={fieldCls}
                >
                  <option value="">Opciones estáticas</option>
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      Columna: {c.name}
                    </option>
                  ))}
                </select>
                {!p.options_from_column && (
                  <textarea
                    value={optionsToText(p.options ?? [])}
                    onChange={(e) => patch(i, { options: textToOptions(e.target.value) })}
                    placeholder={'valor|etiqueta\n039|Guadalajara'}
                    rows={3}
                    className={`${fieldCls} font-mono`}
                  />
                )}
              </div>
            )}

            {usesRange && (
              <div className="flex gap-1">
                <input
                  type="number"
                  value={p.min ?? ''}
                  onChange={(e) => patch(i, { min: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="mín"
                  className={fieldCls}
                />
                <input
                  type="number"
                  value={p.max ?? ''}
                  onChange={(e) => patch(i, { max: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="máx"
                  className={fieldCls}
                />
                <input
                  type="number"
                  value={p.step ?? ''}
                  onChange={(e) => patch(i, { step: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="paso"
                  className={fieldCls}
                />
              </div>
            )}

            <input
              value={p.default == null ? '' : String(p.default)}
              onChange={(e) => patch(i, { default: e.target.value || null })}
              placeholder="valor por defecto"
              className={fieldCls}
            />
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => onChange([...params, newParam(params.length)])}
        className="rounded px-1.5 py-0.5 text-xs font-semibold text-iieg-600 hover:bg-iieg-50"
      >
        + Agregar parámetro
      </button>
    </div>
  )
}
