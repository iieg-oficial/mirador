// Código JS con el que se siembra el editor del modo Avanzado al entrar desde
// el builder visual: en vez de una plantilla genérica, el `option` que ya
// reproduce la gráfica configurada (RF-09: buildOption/applyOverrides se
// exportan justo para esto). Lógica pura, sin React, testeable en aislamiento.

import { applyOverrides, buildOption } from './ChartRenderer'
import type { ChartSpec } from '@/types/charts'

/** `null` si el tipo no tiene traducción a ECharts: table/kpi son componentes
 * React propios, no pasan por buildOption. */
export function buildVisualCodeSeed(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
): string | null {
  if (spec.visual.chart_type === 'table' || spec.visual.chart_type === 'kpi') return null
  const option = applyOverrides(buildOption(spec, rows), spec)
  return (
    `// Generado desde el modo visual — edita lo que necesites.\n` +
    `return ${JSON.stringify(option, null, 2)}\n`
  )
}
