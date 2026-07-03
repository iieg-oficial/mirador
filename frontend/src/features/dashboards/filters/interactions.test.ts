import { describe, expect, it } from 'vitest'
import { crossFilterOf, resolveCrossFilters, toggleInteraction } from './interactions'

describe('crossFilterOf', () => {
  it('lee la config o devuelve deshabilitado por default', () => {
    expect(crossFilterOf({})).toEqual({ enabled: false, targets: [] })
    expect(
      crossFilterOf({ cross_filter: { enabled: true, targets: [{ item_id: 'b', field: 'cve' }] } }),
    ).toEqual({ enabled: true, targets: [{ item_id: 'b', field: 'cve' }] })
  })
})

describe('toggleInteraction', () => {
  it('setea el valor, y reclic sobre el mismo valor lo quita', () => {
    const s1 = toggleInteraction({}, 'a', 'Guadalajara')
    expect(s1).toEqual({ a: 'Guadalajara' })
    const s2 = toggleInteraction(s1, 'a', 'Guadalajara')
    expect(s2).toEqual({})
    const s3 = toggleInteraction(s1, 'a', 'Zapopan')
    expect(s3).toEqual({ a: 'Zapopan' })
  })
})

describe('resolveCrossFilters', () => {
  const items = [
    { id: 'a', local_config: { cross_filter: { enabled: true, targets: [{ item_id: 'b', field: 'cve_mun' }] } } },
    { id: 'b', local_config: {} },
    { id: 'c', local_config: { cross_filter: { enabled: false, targets: [{ item_id: 'b', field: 'x' }] } } },
  ]

  it('aplica el filtro solo al item mapeado en targets', () => {
    expect(resolveCrossFilters(items, { a: 'Guadalajara' }, 'b')).toEqual([
      { field: 'cve_mun', operator: '=', value: 'Guadalajara' },
    ])
    expect(resolveCrossFilters(items, { a: 'Guadalajara' }, 'c')).toEqual([])
  })

  it('ignora fuentes deshabilitadas o sin interacción activa', () => {
    expect(resolveCrossFilters(items, { c: 'x' }, 'b')).toEqual([])
    expect(resolveCrossFilters(items, {}, 'b')).toEqual([])
  })

  it('un item no se autofiltra', () => {
    expect(resolveCrossFilters(items, { a: 'Guadalajara' }, 'a')).toEqual([])
  })
})
