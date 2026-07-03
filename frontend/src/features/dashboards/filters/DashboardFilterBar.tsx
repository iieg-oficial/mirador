// Barra de filtros globales en runtime (editor y preview). Renderiza un control
// por filtro, más chips de filtros activos y "limpiar" (§5.3/§6.4).

import { FilterControl } from './FilterControl'
import {
  filterValueLabel,
  isEmptyValue,
  type DashboardFilter,
  type FilterOption,
} from './dashboardFilters'

interface Props {
  filters: DashboardFilter[]
  values: Record<string, unknown>
  optionsById: Record<string, FilterOption[]>
  onChange: (values: Record<string, unknown>) => void
  onOptions: (filterId: string, options: FilterOption[]) => void
  onClear: () => void
}

export function DashboardFilterBar({
  filters,
  values,
  optionsById,
  onChange,
  onOptions,
  onClear,
}: Props) {
  if (filters.length === 0) {
    return <p className="text-xs text-gray-400">Este tablero no tiene filtros configurados.</p>
  }

  const active = filters.filter((f) => !isEmptyValue(values[f.id]) && !(f.control_type === 'toggle' && !values[f.id]))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {filters.map((f) => (
          <div key={f.id} className="min-w-[9rem]">
            <FilterControl
              filter={f}
              value={values[f.id]}
              onChange={(v) => onChange({ ...values, [f.id]: v })}
              onOptions={onOptions}
            />
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full bg-iieg-50 px-2 py-0.5 text-[11px] text-iieg-700"
            >
              <span className="font-semibold">{f.label}:</span>
              {filterValueLabel(f, values[f.id], optionsById[f.id] ?? f.options)}
              <button
                type="button"
                onClick={() => onChange({ ...values, [f.id]: undefined })}
                className="text-iieg-400 hover:text-iieg-700"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  )
}
