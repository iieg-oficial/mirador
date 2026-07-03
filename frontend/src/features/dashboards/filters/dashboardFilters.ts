// Filtros globales configurables del tablero (RF-14, §5.2/§5.3). Espejo de
// DashboardFilter en el backend + los helpers puros que convierten una
// definición de filtro + su valor actual en los FilterSpec que se mergean a
// cada item `chart`. Lógica sin React → testeable en aislamiento.

import type { FilterOperator, FilterSpec } from '@/types/charts'

export type ControlType =
  | 'select'
  | 'multiselect'
  | 'year'
  | 'numrange'
  | 'daterange'
  | 'toggle'
  | 'text'

export interface FilterOption {
  value: unknown
  label: string
}

export interface FilterTarget {
  item_id: string
  field: string
}

export interface DashboardFilter {
  id: string
  label: string
  control_type: ControlType
  source_dataset_id?: string | null
  value_field?: string | null
  label_field?: string | null
  options: FilterOption[]
  default_value?: unknown
  required: boolean
  // Vacío → se aplica a todo item chart usando value_field/id como campo.
  targets: FilterTarget[]
}

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
  select: 'Select único',
  multiselect: 'Multi-select',
  year: 'Año',
  numrange: 'Rango numérico',
  daterange: 'Rango de fechas',
  toggle: 'Sí/No',
  text: 'Texto',
}

const RANGE_CONTROLS: ControlType[] = ['numrange', 'daterange']

function isEmptyScalar(v: unknown): boolean {
  return v == null || v === ''
}

/** El valor del filtro está "sin usar" (no genera FilterSpec). */
export function isEmptyValue(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmptyScalar)
  return isEmptyScalar(v)
}

export function controlOperator(t: ControlType): FilterOperator {
  if (t === 'multiselect') return 'in'
  if (RANGE_CONTROLS.includes(t)) return 'between'
  return '='
}

/** Nuevo filtro vacío con un id/label placeholder para el panel de config. */
export function newFilter(index: number): DashboardFilter {
  return {
    id: `filtro_${index + 1}`,
    label: `Filtro ${index + 1}`,
    control_type: 'select',
    options: [],
    required: false,
    targets: [],
  }
}

/** Valores iniciales de los filtros a partir de sus defaults. */
export function defaultFilterValues(filters: DashboardFilter[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of filters) if (f.default_value != null) out[f.id] = f.default_value
  return out
}

/** FilterSpecs a aplicar a un item dado el valor actual de cada filtro. */
export function resolveItemFilters(
  filters: DashboardFilter[],
  values: Record<string, unknown>,
  itemId: string,
): FilterSpec[] {
  const specs: FilterSpec[] = []
  for (const f of filters) {
    const value = values[f.id]
    if (isEmptyValue(value)) continue
    if (f.control_type === 'toggle' && !value) continue
    // Un rango necesita sus dos extremos para aplicarse.
    if (RANGE_CONTROLS.includes(f.control_type)) {
      const arr = Array.isArray(value) ? value : []
      if (arr.length !== 2 || arr.some(isEmptyScalar)) continue
    }
    const operator = controlOperator(f.control_type)
    if (f.targets.length > 0) {
      for (const t of f.targets) {
        if (t.item_id === itemId) specs.push({ field: t.field, operator, value })
      }
    } else {
      specs.push({ field: f.value_field || f.id, operator, value })
    }
  }
  return specs
}

/** Etiqueta legible del valor actual de un filtro (para `{{ filter.<id> }}` y chips). */
export function filterValueLabel(
  filter: DashboardFilter,
  value: unknown,
  options: FilterOption[],
): string {
  if (isEmptyValue(value)) return ''
  const labelOf = (v: unknown): string => {
    const opt = options.find((o) => String(o.value) === String(v))
    return opt ? opt.label : String(v)
  }
  if (Array.isArray(value)) {
    if (RANGE_CONTROLS.includes(filter.control_type)) {
      return value.map((v) => String(v ?? '')).join(' – ')
    }
    return value.map(labelOf).join(', ')
  }
  if (filter.control_type === 'toggle') return value ? 'Sí' : 'No'
  return labelOf(value)
}

/** Contexto `filter.*` para el interpolador de Markdown. */
export function filterTemplateContext(
  filters: DashboardFilter[],
  values: Record<string, unknown>,
  optionsById: Record<string, FilterOption[]>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of filters) {
    out[f.id] = filterValueLabel(f, values[f.id], optionsById[f.id] ?? f.options)
  }
  return out
}
