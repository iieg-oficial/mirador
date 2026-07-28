import { describe, expect, it } from 'vitest'
import { buildVisualCodeSeed } from './codeSeed'
import { emptySpec } from '@/types/charts'
import type { ChartSpec } from '@/types/charts'

function barSpec(): ChartSpec {
  const spec = emptySpec('ds-1', 'bar')
  spec.visual.title = 'Población por municipio'
  spec.encodings.x = [{ field: 'municipio' }]
  spec.encodings.y = [{ field: 'poblacion', aggregation: 'sum' }]
  return spec
}

/** Ejecuta el código generado tal como lo haría el sandbox real (sandbox.ts). */
function run(code: string, rows: Record<string, unknown>[]): any {
  const fn = new Function('rows', 'echarts', 'params', code)
  return fn(rows, {}, {})
}

describe('buildVisualCodeSeed', () => {
  it('devuelve null para table (sin traducción a ECharts)', () => {
    expect(buildVisualCodeSeed(emptySpec('ds-1', 'table'))).toBeNull()
  })

  it('devuelve null para kpi (sin traducción a ECharts)', () => {
    expect(buildVisualCodeSeed(emptySpec('ds-1', 'kpi'))).toBeNull()
  })

  it('usa `rows` en vivo: el mismo código produce datos distintos con datasets distintos', () => {
    const code = buildVisualCodeSeed(barSpec())!
    expect(code).toContain('rows.map(')
    // No debe haber ningún valor concreto de esta corrida "horneado" en el código.
    expect(code).not.toContain('Guadalajara')
    expect(code).not.toContain('100')

    const optionA = run(code, [{ municipio: 'Guadalajara', poblacion: 100 }])
    expect(optionA.series[0].data).toEqual([100])

    // Reejecutar el MISMO código con OTRAS filas: si estuviera "congelado" con
    // los valores viejos, esto fallaría.
    const optionB = run(code, [
      { municipio: 'Zapopan', poblacion: 50 },
      { municipio: 'Tlaquepaque', poblacion: 75 },
    ])
    expect(optionB.series[0].data).toEqual([50, 75])
    expect(optionB.xAxis.data).toEqual(['Zapopan', 'Tlaquepaque'])
  })

  it('bar con columna de serie agrupa dinámicamente', () => {
    const spec = barSpec()
    spec.encodings.color = { field: 'anio' }
    const code = buildVisualCodeSeed(spec)!
    const rows = [
      { municipio: 'Guadalajara', anio: '2023', poblacion: 10 },
      { municipio: 'Guadalajara', anio: '2024', poblacion: 20 },
      { municipio: 'Zapopan', anio: '2023', poblacion: 30 },
    ]
    const option = run(code, rows)
    expect(option.series.map((s: any) => s.name).sort()).toEqual(['2023', '2024'])
    expect(option.xAxis.data).toEqual(['Guadalajara', 'Zapopan'])
  })

  it('pie usa rows.map y agrega name/value dinámicos', () => {
    const spec = emptySpec('ds-1', 'pie')
    spec.encodings.x = [{ field: 'municipio' }]
    spec.encodings.y = [{ field: 'poblacion', aggregation: 'sum' }]
    const code = buildVisualCodeSeed(spec)!
    expect(code).toContain('rows.map(')
    const option = run(code, [{ municipio: 'Guadalajara', poblacion: 5 }])
    expect(option.series[0].data).toEqual([{ name: 'Guadalajara', value: 5 }])
  })

  it('candlestick arma la tupla open/close/lowest/highest por fila', () => {
    const spec = emptySpec('ds-1', 'candlestick')
    spec.encodings.x = [{ field: 'fecha' }]
    spec.encodings.fields = { open: 'o', close: 'c', lowest: 'l', highest: 'h' }
    const code = buildVisualCodeSeed(spec)!
    const option = run(code, [{ fecha: '2024-01-01', o: 1, c: 2, l: 0, h: 3 }])
    expect(option.series[0].data).toEqual([[1, 2, 0, 3]])
  })

  it('no revienta con rows vacías', () => {
    const code = buildVisualCodeSeed(barSpec())!
    expect(() => run(code, [])).not.toThrow()
  })
})
