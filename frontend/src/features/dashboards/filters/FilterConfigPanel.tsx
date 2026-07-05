// Panel de configuración de filtros globales del tablero (§5.2). Edita la lista
// de definiciones DashboardFilter: control, origen de opciones (dataset o lista
// estática), default, obligatoriedad y mapeo por bloque (targets).

import { useQuery } from '@tanstack/react-query'
import { listDatasets } from '@/features/datasets/api'
import {
  CONTROL_TYPE_LABELS,
  newFilter,
  type ControlType,
  type DashboardFilter,
  type FilterOption,
} from './dashboardFilters'

interface Props {
  filters: DashboardFilter[]
  onChange: (filters: DashboardFilter[]) => void
  chartItems: { id: string; label: string }[]
}

const fieldCls = 'w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-iieg-400 focus:outline-none focus:ring-1 focus:ring-iieg-400'

// "value|label" por línea → opciones estáticas (y de vuelta).
function optionsToText(options: FilterOption[]): string {
  return options.map((o) => (o.label === String(o.value) ? String(o.value) : `${o.value}|${o.label}`)).join('\n')
}
function textToOptions(text: string): FilterOption[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [value, label] = l.split('|')
      return { value: value.trim(), label: (label ?? value).trim() }
    })
}

export function FilterConfigPanel({ filters, onChange, chartItems }: Props) {
  const { data: datasets = [] } = useQuery({ queryKey: ['datasets'], queryFn: () => listDatasets() })

  const patch = (i: number, p: Partial<DashboardFilter>) =>
    onChange(filters.map((f, j) => (j === i ? { ...f, ...p } : f)))

  return (
    <div className="space-y-3">
      {filters.map((f, i) => {
        const usesOptions = f.control_type === 'select' || f.control_type === 'multiselect'
        return (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-2">
            <div className="flex items-center gap-1">
              <input
                value={f.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="Nombre visible"
                className={fieldCls}
              />
              <button
                type="button"
                onClick={() => onChange(filters.filter((_, j) => j !== i))}
                className="rounded px-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>

            <div className="flex gap-1">
              <input
                value={f.id}
                onChange={(e) => patch(i, { id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
                placeholder="id (variable)"
                className={fieldCls}
                title="Identificador interno y nombre en {{ filter.id }}"
              />
              <select
                value={f.control_type}
                onChange={(e) => patch(i, { control_type: e.target.value as ControlType })}
                className={fieldCls}
              >
                {(Object.keys(CONTROL_TYPE_LABELS) as ControlType[]).map((t) => (
                  <option key={t} value={t}>
                    {CONTROL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {usesOptions && (
              <div className="space-y-1 rounded bg-gray-50 p-1.5">
                <select
                  value={f.source_dataset_id ?? ''}
                  onChange={(e) => patch(i, { source_dataset_id: e.target.value || null })}
                  className={fieldCls}
                >
                  <option value="">Opciones estáticas</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      Dataset: {d.name}
                    </option>
                  ))}
                </select>
                {f.source_dataset_id ? (
                  <div className="flex gap-1">
                    <input
                      value={f.value_field ?? ''}
                      onChange={(e) => patch(i, { value_field: e.target.value })}
                      placeholder="campo valor"
                      className={fieldCls}
                    />
                    <input
                      value={f.label_field ?? ''}
                      onChange={(e) => patch(i, { label_field: e.target.value })}
                      placeholder="campo etiqueta"
                      className={fieldCls}
                    />
                  </div>
                ) : (
                  <textarea
                    value={optionsToText(f.options)}
                    onChange={(e) => patch(i, { options: textToOptions(e.target.value) })}
                    placeholder={'valor|etiqueta\n039|Guadalajara'}
                    rows={3}
                    className={`${fieldCls} font-mono`}
                  />
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                value={f.default_value == null ? '' : String(f.default_value)}
                onChange={(e) => patch(i, { default_value: e.target.value || null })}
                placeholder="valor por defecto"
                className={fieldCls}
              />
              <label className="flex flex-shrink-0 items-center gap-1 text-[11px] text-gray-500">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                Obligatorio
              </label>
            </div>

            {chartItems.length > 0 && (
              <div className="rounded bg-gray-50 p-1.5">
                <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                  Bloques afectados {f.targets.length === 0 && '(vacío → todos)'}
                </p>
                <div className="space-y-1">
                  {chartItems.map((it) => {
                    const target = f.targets.find((t) => t.item_id === it.id)
                    return (
                      <div key={it.id} className="flex items-center gap-1.5">
                        <label className="flex flex-1 items-center gap-1 truncate text-[11px] text-gray-600">
                          <input
                            type="checkbox"
                            checked={!!target}
                            onChange={(e) =>
                              patch(i, {
                                targets: e.target.checked
                                  ? [...f.targets, { item_id: it.id, field: f.value_field || f.id }]
                                  : f.targets.filter((t) => t.item_id !== it.id),
                              })
                            }
                          />
                          {it.label}
                        </label>
                        {target && (
                          <input
                            value={target.field}
                            onChange={(e) =>
                              patch(i, {
                                targets: f.targets.map((t) =>
                                  t.item_id === it.id ? { ...t, field: e.target.value } : t,
                                ),
                              })
                            }
                            placeholder="campo"
                            className="w-24 rounded border border-gray-200 px-1.5 py-0.5 text-[11px]"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => onChange([...filters, newFilter(filters.length)])}
        className="rounded px-1.5 py-0.5 text-xs font-semibold text-iieg-600 hover:bg-iieg-50"
      >
        + Agregar filtro
      </button>
    </div>
  )
}
