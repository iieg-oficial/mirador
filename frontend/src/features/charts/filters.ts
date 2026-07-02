// Conversión entre el borrador de filtro de la UI (valor capturado como
// texto) y el FilterSpec que espera el backend. Compartido por el builder de
// gráficas y los filtros globales/locales de tableros (RF-14).

import type { FilterOperator, FilterSpec } from '@/types/charts'
import type { ColumnMeta } from '@/types/datasets'

export interface FilterDraft {
  field: string
  operator: FilterOperator
  value: string
}

/** Convierte el valor de texto de un filtro al tipo que espera el backend:
 * números para columnas métricas, listas separadas por coma para in/not_in/
 * between, sin valor para is_null/is_not_null. */
export function draftToFilter(draft: FilterDraft, columns: ColumnMeta[]): FilterSpec {
  const base = { field: draft.field, operator: draft.operator }
  if (draft.operator === 'is_null' || draft.operator === 'is_not_null') return base
  const col = columns.find((c) => c.name === draft.field)
  const numeric = col?.is_metric || col?.semantic_type === 'metrica'
  const scalar = (s: string): unknown => {
    const t = s.trim()
    if (numeric && t !== '' && !Number.isNaN(Number(t))) return Number(t)
    return t
  }
  if (draft.operator === 'in' || draft.operator === 'not_in' || draft.operator === 'between') {
    return { ...base, value: draft.value.split(',').map((s) => scalar(s)) }
  }
  return { ...base, value: scalar(draft.value) }
}

export function filterToDraft(f: FilterSpec): FilterDraft {
  return {
    field: f.field,
    operator: f.operator,
    value: Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? ''),
  }
}
