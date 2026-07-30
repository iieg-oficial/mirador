import { describe, expect, it } from 'vitest'
import { defaultParamValues, optionsForParam } from './params'
import type { ParamSpec } from '@/types/charts'

const base = (over: Partial<ParamSpec>): ParamSpec => ({
  id: 'p',
  label: 'P',
  control: 'text',
  ...over,
})

describe('defaultParamValues', () => {
  it('usa `default` cuando está declarado', () => {
    const params = [base({ id: 'anio', control: 'number', default: 2024 })]
    expect(defaultParamValues(params)).toEqual({ anio: 2024 })
  })

  it('multiselect sin default arranca en []', () => {
    const params = [base({ id: 'municipios', control: 'multiselect' })]
    expect(defaultParamValues(params)).toEqual({ municipios: [] })
  })

  it('checkbox sin default arranca en false', () => {
    const params = [base({ id: 'activo', control: 'checkbox' })]
    expect(defaultParamValues(params)).toEqual({ activo: false })
  })

  it('el resto de controles sin default arranca en null', () => {
    const params = [base({ id: 'x', control: 'select' })]
    expect(defaultParamValues(params)).toEqual({ x: null })
  })
})

describe('optionsForParam', () => {
  const rows = [
    { municipio: 'Zapopan' },
    { municipio: 'Guadalajara' },
    { municipio: 'Guadalajara' },
    { municipio: null },
  ]

  it('usa las opciones estáticas si están declaradas', () => {
    const p = base({ control: 'select', options: [{ value: 'a', label: 'A' }] })
    expect(optionsForParam(p, rows)).toEqual([{ value: 'a', label: 'A' }])
  })

  it('deriva opciones de una columna: deduplicadas, sin nulos, ordenadas', () => {
    const p = base({ control: 'select', options_from_column: 'municipio' })
    expect(optionsForParam(p, rows)).toEqual([
      { value: 'Guadalajara', label: 'Guadalajara' },
      { value: 'Zapopan', label: 'Zapopan' },
    ])
  })

  it('sin options ni options_from_column devuelve []', () => {
    const p = base({ control: 'text' })
    expect(optionsForParam(p, rows)).toEqual([])
  })

  it('respeta un tope de opciones derivadas', () => {
    const manyRows = Array.from({ length: 1500 }, (_, i) => ({ m: `m${i}` }))
    const p = base({ control: 'select', options_from_column: 'm' })
    expect(optionsForParam(p, manyRows).length).toBe(1000)
  })
})
