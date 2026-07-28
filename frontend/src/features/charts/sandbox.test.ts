import { describe, expect, it, vi } from 'vitest'
import { makeSandboxApi, runUserCode } from './sandbox'

describe('runUserCode', () => {
  it('acepta un option a secas (contrato anterior, retrocompatible)', () => {
    const code = "return { series: [{ type: 'bar', data: rows.map(r => r.n) }] }"
    const { option, events } = runUserCode(code, [{ n: 1 }, { n: 2 }], {})
    expect(option).toEqual({ series: [{ type: 'bar', data: [1, 2] }] })
    expect(events).toEqual({})
  })

  it('extrae option y events cuando el código devuelve { option, events }', () => {
    const code = `
      return {
        option: { series: [] },
        events: { click(p, api) { api.highlight('a') } },
      }
    `
    const { option, events } = runUserCode(code, [], {})
    expect(option).toEqual({ series: [] })
    expect(Object.keys(events)).toEqual(['click'])
  })

  it('params está disponible en el scope del código', () => {
    const code = 'return { title: { text: String(params.anio) } }'
    const { option } = runUserCode(code, [], { anio: 2024 })
    expect(option).toEqual({ title: { text: '2024' } })
  })

  it('rechaza un events con un valor que no es función', () => {
    const code = 'return { option: {}, events: { click: 123 } }'
    expect(() => runUserCode(code, [], {})).toThrow(/events\.click debe ser una función/)
  })

  it('rechaza un código que no devuelve un objeto', () => {
    expect(() => runUserCode('return 42', [], {})).toThrow()
    expect(() => runUserCode('', [], {})).toThrow()
  })
})

describe('makeSandboxApi', () => {
  it('cada método delega en dispatchAction con el `type` correspondiente', () => {
    const dispatchAction = vi.fn()
    const api = makeSandboxApi({ dispatchAction } as unknown as import('echarts').ECharts)

    api.highlight('serieA')
    api.downplay('serieA')
    api.select('serieA')
    api.unselect('serieA')
    api.dispatchAction({ type: 'custom' })

    expect(dispatchAction).toHaveBeenNthCalledWith(1, { type: 'highlight', seriesName: 'serieA' })
    expect(dispatchAction).toHaveBeenNthCalledWith(2, { type: 'downplay', seriesName: 'serieA' })
    expect(dispatchAction).toHaveBeenNthCalledWith(3, { type: 'select', seriesName: 'serieA' })
    expect(dispatchAction).toHaveBeenNthCalledWith(4, { type: 'unselect', seriesName: 'serieA' })
    expect(dispatchAction).toHaveBeenNthCalledWith(5, { type: 'custom' })
  })
})
