// plotly.js-dist-min no publica tipos; se declara solo la superficie que se usa
// (render de figuras ya serializadas por fig.to_json() — ver pythonRuntime.ts).
declare module 'plotly.js-dist-min' {
  export function newPlot(
    el: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<unknown>
  export function purge(el: HTMLElement): void
  export const Plots: { resize(el: HTMLElement): void }
}
