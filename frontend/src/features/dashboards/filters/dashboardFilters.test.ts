import { describe, expect, it } from 'vitest'
import {
  controlOperator,
  defaultFilterValues,
  filterTemplateContext,
  filterValueLabel,
  resolveItemFilters,
  type DashboardFilter,
} from './dashboardFilters'

const base = (over: Partial<DashboardFilter>): DashboardFilter => ({
  id: 'f',
  label: 'F',
  control_type: 'select',
  options: [],
  required: false,
  targets: [],
  ...over,
})

describe('controlOperator', () => {
  it('mapea el control al operador de FilterSpec', () => {
    expect(controlOperator('select')).toBe('=')
    expect(controlOperator('year')).toBe('=')
    expect(controlOperator('multiselect')).toBe('in')
    expect(controlOperator('numrange')).toBe('between')
    expect(controlOperator('daterange')).toBe('between')
  })
})

describe('resolveItemFilters', () => {
  it('broadcast (sin targets) usa value_field o id como campo', () => {
    const f = base({ id: 'municipio', value_field: 'cve_mun' })
    const specs = resolveItemFilters([f], { municipio: '039' }, 'item-1')
    expect(specs).toEqual([{ field: 'cve_mun', operator: '=', value: '039' }])
  })

  it('con targets solo aplica al item mapeado y con su campo', () => {
    const f = base({
      id: 'municipio',
      targets: [{ item_id: 'item-1', field: 'cve' }],
    })
    expect(resolveItemFilters([f], { municipio: '039' }, 'item-1')).toEqual([
      { field: 'cve', operator: '=', value: '039' },
    ])
    expect(resolveItemFilters([f], { municipio: '039' }, 'item-2')).toEqual([])
  })

  it('ignora filtros sin valor', () => {
    const f = base({ id: 'x' })
    expect(resolveItemFilters([f], {}, 'item-1')).toEqual([])
    expect(resolveItemFilters([f], { x: '' }, 'item-1')).toEqual([])
  })

  it('un rango incompleto no se aplica', () => {
    const f = base({ id: 'anio', control_type: 'numrange' })
    expect(resolveItemFilters([f], { anio: [2020, ''] }, 'item-1')).toEqual([])
    expect(resolveItemFilters([f], { anio: [2020, 2025] }, 'item-1')).toEqual([
      { field: 'anio', operator: 'between', value: [2020, 2025] },
    ])
  })

  it('toggle apagado no filtra', () => {
    const f = base({ id: 'activo', control_type: 'toggle' })
    expect(resolveItemFilters([f], { activo: false }, 'item-1')).toEqual([])
    expect(resolveItemFilters([f], { activo: true }, 'item-1')).toEqual([
      { field: 'activo', operator: '=', value: true },
    ])
  })
})

describe('filterValueLabel', () => {
  it('resuelve la etiqueta de la opción para un valor', () => {
    const f = base({ id: 'm' })
    const opts = [{ value: '039', label: 'Guadalajara' }]
    expect(filterValueLabel(f, '039', opts)).toBe('Guadalajara')
    expect(filterValueLabel(f, '999', opts)).toBe('999')
  })

  it('une multiselect y formatea rangos', () => {
    const ms = base({ id: 'g', control_type: 'multiselect' })
    expect(filterValueLabel(ms, ['H', 'M'], [])).toBe('H, M')
    const rng = base({ id: 'a', control_type: 'daterange' })
    expect(filterValueLabel(rng, ['2020-01-01', '2020-12-31'], [])).toBe('2020-01-01 – 2020-12-31')
  })
})

describe('defaultFilterValues / filterTemplateContext', () => {
  it('toma defaults y arma el contexto filter.*', () => {
    const f = base({ id: 'anio', default_value: 2026, options: [{ value: 2026, label: '2026' }] })
    expect(defaultFilterValues([f])).toEqual({ anio: 2026 })
    expect(filterTemplateContext([f], { anio: 2026 }, {})).toEqual({ anio: '2026' })
  })
})
