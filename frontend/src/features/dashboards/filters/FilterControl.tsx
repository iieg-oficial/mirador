// Un control de filtro global, renderizado según su control_type. Reporta las
// opciones resueltas hacia arriba (onOptions) para que el editor arme el
// contexto `{{ filter.* }}` de Markdown y los chips de filtros activos.

import { useEffect } from 'react'
import { useFilterOptions } from './useFilterOptions'
import { ControlInput } from '@/components/shared/ControlInput'
import type { DashboardFilter, FilterOption } from './dashboardFilters'

interface Props {
  filter: DashboardFilter
  value: unknown
  onChange: (value: unknown) => void
  onOptions?: (filterId: string, options: FilterOption[]) => void
}

export function FilterControl({ filter, value, onChange, onOptions }: Props) {
  const needsOptions = filter.control_type === 'select' || filter.control_type === 'multiselect'
  const { options, isLoading } = useFilterOptions(filter)

  useEffect(() => {
    if (needsOptions) onOptions?.(filter.id, options)
  }, [needsOptions, filter.id, options, onOptions])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-gray-500">
        {filter.label}
        {filter.required && <span className="text-red-500"> *</span>}
      </label>
      <ControlInput
        controlType={filter.control_type}
        label={filter.label}
        value={value}
        onChange={onChange}
        options={options}
        optionsLoading={isLoading}
      />
    </div>
  )
}
