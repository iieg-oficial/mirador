// Opciones de un filtro select/multiselect. Origen: lista estática del filtro,
// o los valores distintos de un dataset. ponytail: reutiliza el preview de
// datasets ya existente en vez de un endpoint nuevo — las fuentes reales de
// opciones son catálogos/dimensiones pequeños (municipios, géneros, años).
// Ceiling: las opciones se limitan a las filas del preview (max_rows del
// dataset); si una fuente supera ese tope hará falta un DISTINCT server-side.

import { useQuery } from '@tanstack/react-query'
import { previewDataset } from '@/features/datasets/api'
import type { DashboardFilter, FilterOption } from './dashboardFilters'

export function useFilterOptions(filter: DashboardFilter): {
  options: FilterOption[]
  isLoading: boolean
} {
  const usesDataset = !!filter.source_dataset_id && !!filter.value_field
  const { data, isLoading } = useQuery({
    queryKey: ['filter-options', filter.source_dataset_id, filter.value_field, filter.label_field],
    enabled: usesDataset,
    queryFn: async () => {
      const preview = await previewDataset(filter.source_dataset_id!)
      const vf = filter.value_field!
      const lf = filter.label_field || vf
      const seen = new Map<string, FilterOption>()
      for (const row of preview.rows) {
        const value = row[vf]
        if (value == null) continue
        const key = String(value)
        if (!seen.has(key)) seen.set(key, { value, label: String(row[lf] ?? value) })
      }
      return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
    },
  })
  if (!usesDataset) return { options: filter.options, isLoading: false }
  return { options: data ?? [], isLoading }
}
