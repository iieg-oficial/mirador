// Lógica pura para los parámetros interactivos del modo avanzado (ver ParamBar,
// ParamConfigPanel y sandbox.ts). Sin dependencias de React para poder testear
// sin jsdom.

import type { ParamSpec } from '@/types/charts'

/** Tope de opciones derivadas de una columna: evita un <select> con miles de entradas. */
const MAX_DERIVED_OPTIONS = 1000

function emptyValueFor(control: ParamSpec['control']): unknown {
  if (control === 'multiselect') return []
  if (control === 'checkbox') return false
  return null
}

export function defaultParamValues(params: ParamSpec[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const p of params) {
    values[p.id] = p.default ?? emptyValueFor(p.control)
  }
  return values
}

interface ParamOptionLike {
  value: unknown
  label: string
}

/** Opciones de un param: estáticas si las declara, o derivadas de `rows` (deduplicadas y ordenadas). */
export function optionsForParam(
  param: ParamSpec,
  rows: Record<string, unknown>[],
): ParamOptionLike[] {
  if (param.options && param.options.length > 0) return param.options

  const column = param.options_from_column
  if (!column) return []

  const seen = new Set<string>()
  const values: unknown[] = []
  for (const row of rows) {
    const v = row[column]
    if (v == null) continue
    const key = String(v)
    if (seen.has(key)) continue
    seen.add(key)
    values.push(v)
    if (values.length >= MAX_DERIVED_OPTIONS) break
  }
  values.sort((a, b) => String(a).localeCompare(String(b), 'es'))
  return values.map((v) => ({ value: v, label: String(v) }))
}
