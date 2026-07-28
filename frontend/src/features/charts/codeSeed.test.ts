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

describe('buildVisualCodeSeed', () => {
  it('devuelve null para table (sin traducción a ECharts)', () => {
    expect(buildVisualCodeSeed(emptySpec('ds-1', 'table'), [])).toBeNull()
  })

  it('devuelve null para kpi (sin traducción a ECharts)', () => {
    expect(buildVisualCodeSeed(emptySpec('ds-1', 'kpi'), [])).toBeNull()
  })

  it('genera código que retorna el option de la spec, parseable como JSON', () => {
    const rows = [{ municipio: 'Guadalajara', poblacion: 100 }]
    const code = buildVisualCodeSeed(barSpec(), rows)
    expect(code).toContain('return {')
    const jsonPart = code!.replace(/^.*return /s, '')
    const option = JSON.parse(jsonPart)
    expect(option.title.text).toBe('Población por municipio')
    expect(option.series[0].data).toEqual([100])
  })

  it('no revienta con rows vacías', () => {
    const code = buildVisualCodeSeed(barSpec(), [])
    expect(code).toContain('return {')
    expect(() => JSON.parse(code!.replace(/^.*return /s, ''))).not.toThrow()
  })
})
