import type { ECharts, EChartsOption } from 'echarts'
import * as echarts from 'echarts'

type DispatchPayload = Parameters<ECharts['dispatchAction']>[0]

// Sandbox del modo avanzado: ejecuta el JS del usuario (herramienta interna,
// sin aislamiento real — ver el comentario en SandboxEditor.tsx). En scope:
// `rows` (filas del dataset), `echarts` (el módulo) y `params` (valores de los
// controles interactivos declarados en la spec). El código debe `return` un
// objeto `option` de ECharts, o `{ option, events }` para además registrar
// manejadores de eventos de la instancia.

/** API acotada que reciben los manejadores de `events` como segundo argumento.
 * No es una frontera de seguridad (el sandbox ya corre sin aislamiento): es
 * ergonomía y estabilidad de contrato frente a exponer la instancia entera. */
export interface SandboxApi {
  highlight(seriesName: string): void
  downplay(seriesName: string): void
  select(seriesName: string): void
  unselect(seriesName: string): void
  dispatchAction(action: Record<string, unknown>): void
}

export type SandboxEventHandler = (params: unknown, api: SandboxApi) => void
export type SandboxEvents = Record<string, SandboxEventHandler>

export interface SandboxResult {
  option: EChartsOption
  events: SandboxEvents
}

export function makeSandboxApi(chart: ECharts): SandboxApi {
  return {
    highlight: (seriesName) => chart.dispatchAction({ type: 'highlight', seriesName }),
    downplay: (seriesName) => chart.dispatchAction({ type: 'downplay', seriesName }),
    select: (seriesName) => chart.dispatchAction({ type: 'select', seriesName }),
    unselect: (seriesName) => chart.dispatchAction({ type: 'unselect', seriesName }),
    dispatchAction: (action) => chart.dispatchAction(action as DispatchPayload),
  }
}

/**
 * Ejecuta el código del usuario y devuelve `{ option, events }`.
 * Compatibilidad: si el código devuelve un `EChartsOption` a secas (sin una
 * clave `option` de primer nivel, algo que un option real nunca tiene), se
 * trata como `{ option: <lo devuelto>, events: {} }`.
 */
export function runUserCode(
  code: string,
  rows: Record<string, unknown>[],
  params: Record<string, unknown>,
): SandboxResult {
  const fn = new Function('rows', 'echarts', 'params', code) as (
    r: Record<string, unknown>[],
    e: typeof echarts,
    p: Record<string, unknown>,
  ) => unknown
  const ret = fn(rows, echarts, params)
  if (!ret || typeof ret !== 'object') {
    throw new Error('El código debe devolver (return) un objeto `option` de ECharts.')
  }

  const wrapped = 'option' in ret
  const option = (wrapped ? (ret as { option: unknown }).option : ret) as EChartsOption
  if (!option || typeof option !== 'object') {
    throw new Error('`option` debe ser un objeto de ECharts.')
  }

  const rawEvents = wrapped ? (ret as { events?: unknown }).events : undefined
  const events: SandboxEvents = {}
  if (rawEvents != null) {
    if (typeof rawEvents !== 'object') {
      throw new Error('`events` debe ser un objeto { nombreDeEvento: función }.')
    }
    for (const [name, handler] of Object.entries(rawEvents)) {
      if (typeof handler !== 'function') {
        throw new Error(`events.${name} debe ser una función.`)
      }
      events[name] = handler as SandboxEventHandler
    }
  }

  return { option, events }
}
