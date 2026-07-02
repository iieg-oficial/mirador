import * as echarts from 'echarts'

// Tema institucional de ECharts (RNF-07): paleta morada/naranja IIEG-Jalisco,
// espejo de los colores de tailwind.config.ts.

export const INSTITUTIONAL_PALETTE = [
  '#5C2472', // iieg-700 — morado Jalisco (primary)
  '#FF8300', // naranja-500 — acento Jalisco
  '#9a52ba', // iieg-500
  '#e67600', // naranja-600
  '#b57fd0', // iieg-400
  '#fb923c', // naranja claro
  '#7b3699', // iieg-600
  '#64748b', // gris neutro
]

echarts.registerTheme('institutional', {
  color: INSTITUTIONAL_PALETTE,
  textStyle: { fontFamily: 'inherit' },
})

/** Tema para echarts.init según la spec; 'default' usa el tema base de ECharts. */
export function echartsTheme(theme: string): string | undefined {
  return theme === 'institutional' ? 'institutional' : undefined
}
