// Código JS con el que se siembra el editor del modo Avanzado al entrar desde
// el builder visual: en vez de una plantilla genérica, el código que ya
// reproduce la gráfica configurada (RF-09: buildOption fue exportado justo
// para esto). Lógica pura, sin React, testeable en aislamiento.
//
// OJO: esto genera CÓDIGO FUENTE (texto), no el resultado de ejecutar
// buildOption. Serializar el `option` ya calculado dejaría las categorías y
// series con los valores concretos de las `rows` de ese momento — código
// "congelado" que ignora `rows` en cualquier corrida futura (con otro filtro,
// otro preview). El código sembrado tiene que seguir usando `rows` como
// variable en vivo, igual que el resto del sandbox.

import type { ChartSpec, LegendPosition } from '@/types/charts'

function lit(v: unknown): string {
  return JSON.stringify(v)
}

// Espejo de legendPositionOption en ChartRenderer.tsx: no depende de `rows`,
// se puede hornear como literal.
function legendPositionLiteral(pos: LegendPosition): Record<string, unknown> {
  switch (pos) {
    case 'top':
      return { top: 4, left: 'center', orient: 'horizontal' }
    case 'bottom':
      return { bottom: 4, left: 'center', orient: 'horizontal' }
    case 'left':
      return { left: 4, top: 'middle', orient: 'vertical' }
    case 'right':
      return { right: 4, top: 'middle', orient: 'vertical' }
    case 'top-left':
      return { top: 4, left: 4, orient: 'vertical' }
    case 'top-right':
      return { top: 4, right: 4, orient: 'vertical' }
    case 'bottom-left':
      return { bottom: 4, left: 4, orient: 'vertical' }
    case 'bottom-right':
      return { bottom: 4, right: 4, orient: 'vertical' }
  }
}

/** Expresión que reproduce compositeValue(fields, r) de ChartRenderer.tsx. */
function compositeExpr(fields: string[]): string {
  if (fields.length === 0) return `''`
  if (fields.length === 1) return `String(r[${lit(fields[0])}] ?? '')`
  return `${lit(fields)}.map((c) => String(r[c] ?? '')).join(' / ')`
}

function numExpr(field: string): string {
  return `Number(r[${lit(field)}])`
}

/** `null` si el tipo no tiene traducción a ECharts (table/kpi son componentes
 * React, no pasan por buildOption). */
export function buildVisualCodeSeed(spec: ChartSpec): string | null {
  const chartType = spec.visual.chart_type
  if (chartType === 'table' || chartType === 'kpi') return null

  const x = spec.encodings.x.map((e) => e.field)
  const y = spec.encodings.y.map((e) => e.field)
  const seriesField = spec.encodings.color?.field
  const fields = spec.encodings.fields ?? {}
  const x0 = x[0] ?? ''
  const y0 = y[0] ?? ''
  const showLabels = spec.style.show_labels
  const horizontal = spec.style.orientation === 'horizontal'

  const baseTitle = {
    text: spec.visual.title ?? '',
    subtext: spec.visual.subtitle ?? '',
    left: 'left',
    textStyle: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
    subtextStyle: { fontSize: 12, color: '#6b7280' },
  }
  const legendOpt = spec.interactions.legend
    ? { show: true, ...legendPositionLiteral(spec.style.legend_position) }
    : { show: false }
  const tooltipEnabled = spec.interactions.tooltip
  const gridOpt = { containLabel: true, left: 16, right: 16, top: spec.visual.title ? 56 : 16, bottom: 16 }

  const extrasLines: string[] = []
  if (spec.interactions.zoom) extrasLines.push(`  dataZoom: ${lit([{ type: 'inside' }])},`)
  if (spec.interactions.download) {
    extrasLines.push(`  toolbox: ${lit({ feature: { saveAsImage: { title: 'Descargar' } } })},`)
  }
  const extras = extrasLines.length > 0 ? `${extrasLines.join('\n')}\n` : ''

  let body: string

  if (chartType === 'pie') {
    body = `return {
  title: ${lit(baseTitle)},
  legend: ${lit(legendOpt)},
  tooltip: { show: ${tooltipEnabled}, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
${extras}  series: [{
    type: 'pie',
    radius: '65%',
    itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
    label: { show: ${showLabels}, formatter: '{b}\\n{d}%' },
    data: rows.map((r) => ({ name: ${compositeExpr(x)}, value: ${numExpr(y0)} })),
  }],
}
`
  } else if (chartType === 'treemap') {
    body = `return {
  title: ${lit(baseTitle)},
  tooltip: { show: ${tooltipEnabled}, trigger: 'item', formatter: '{b}: {c}' },
${extras}  series: [{
    type: 'treemap',
    roam: false,
    breadcrumb: { show: false },
    label: { show: true, formatter: '{b}' },
    data: rows.map((r) => ({ name: ${compositeExpr(x)}, value: ${numExpr(y0)} })),
  }],
}
`
  } else if (chartType === 'scatter') {
    body = `return {
  title: ${lit(baseTitle)},
  legend: ${lit(legendOpt)},
  tooltip: { show: ${tooltipEnabled}, trigger: 'item' },
${extras}  xAxis: { type: 'value', name: ${lit(x0)} },
  yAxis: { type: 'value', name: ${lit(y0)} },
  series: [{ type: 'scatter', data: rows.map((r) => [${numExpr(x0)}, ${numExpr(y0)}]), symbolSize: 8 }],
}
`
  } else if (chartType === 'candlestick' || chartType === 'boxplot') {
    const keys =
      chartType === 'candlestick' ? ['open', 'close', 'lowest', 'highest'] : ['min', 'q1', 'median', 'q3', 'max']
    const tupleExpr = `[${keys.map((k) => numExpr(fields[k] ?? '')).join(', ')}]`
    body = `return {
  title: ${lit(baseTitle)},
  tooltip: { show: ${tooltipEnabled}, trigger: ${lit(chartType === 'candlestick' ? 'axis' : 'item')} },
  grid: ${lit(gridOpt)},
${extras}  xAxis: {
    type: 'category',
    data: rows.map((r) => ${compositeExpr(x)}),
    axisLabel: { overflow: 'truncate', width: 80 },
  },
  yAxis: { type: 'value', scale: true },
  series: [{ type: ${lit(chartType)}, data: rows.map((r) => ${tupleExpr}) }],
}
`
  } else {
    // Barras / líneas: mismas 3 formas que buildOption según haya columna de
    // serie, varias columnas en y, o una sola — mantenidas como código (no
    // como valores) porque cuál rama aplica depende de las `rows` reales.
    const eType = chartType === 'bar' ? 'bar' : 'line'
    const labelLine = showLabels ? `\nseriesData = seriesData.map((s) => ({ ...s, label: { show: true } }))\n` : ''
    const axisAssign =
      horizontal && chartType === 'bar' ? `xAxis: valAxis,\n  yAxis: catAxis,` : `xAxis: catAxis,\n  yAxis: valAxis,`
    body = `const x = ${lit(x)}
const y0 = ${lit(y0)}
const seriesField = ${lit(seriesField ?? null)}
const compositeValue = (cols, r) =>
  cols.length <= 1 ? String(r[cols[0]] ?? '') : cols.map((c) => String(r[c] ?? '')).join(' / ')

let categoryData, seriesData
if (seriesField) {
  const uniqueSeries = [...new Set(rows.map((r) => String(r[seriesField] ?? '')))]
  categoryData = [...new Set(rows.map((r) => compositeValue(x, r)))]
  seriesData = uniqueSeries.map((sv) => ({
    name: sv,
    type: ${lit(eType)},
    data: categoryData.map((xv) => {
      const row = rows.find((r) => compositeValue(x, r) === xv && String(r[seriesField] ?? '') === sv)
      return row ? row[y0] : null
    }),
  }))
} else if (${lit(y)}.length > 1) {
  categoryData = rows.map((r) => compositeValue(x, r))
  seriesData = ${lit(y)}.map((yCol) => ({ name: yCol, type: ${lit(eType)}, data: rows.map((r) => r[yCol]) }))
} else {
  categoryData = rows.map((r) => compositeValue(x, r))
  seriesData = [{ name: y0, type: ${lit(eType)}, data: rows.map((r) => r[y0]) }]
}
${labelLine}
const catAxis = { type: 'category', data: categoryData, axisLabel: { overflow: 'truncate', width: 80 } }
const valAxis = { type: 'value' }

return {
  title: ${lit(baseTitle)},
  legend: ${lit(legendOpt)},
  tooltip: { show: ${tooltipEnabled}, trigger: 'axis' },
  grid: ${lit(gridOpt)},
${extras}  ${axisAssign}
  series: seriesData,
}
`
  }

  return `// Generado desde el modo visual — edita lo que necesites.\n${body}`
}
