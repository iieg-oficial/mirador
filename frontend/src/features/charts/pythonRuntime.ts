// Runtime de Python para las gráficas de código Plotly: Pyodide (CPython→WASM)
// corre en el navegador, igual que el sandbox JS — el código del usuario nunca
// llega al servidor. Se carga bajo demanda la primera vez que se ejecuta código
// Python y se reutiliza el resto de la sesión.
// ponytail: Pyodide+pandas+plotly llegan del CDN (decenas de MB, cacheados por
// el navegador); empaquetarlos localmente si se necesita operar sin internet.

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/'

/** Figura Plotly serializada (`fig.to_json()`): lo que consume plotly.js. */
export interface PlotlyFigure {
  data: unknown[]
  layout?: Record<string, unknown>
}

interface Pyodide {
  globals: { set(name: string, value: unknown): void }
  loadPackage(names: string): Promise<unknown>
  pyimport(name: string): { install(pkg: string): Promise<void> }
  runPythonAsync(code: string): Promise<unknown>
}

let pyodidePromise: Promise<Pyodide> | null = null

function loadRuntime(): Promise<Pyodide> {
  pyodidePromise ??= (async () => {
    const mod = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
    const py: Pyodide = await mod.loadPyodide({ indexURL: PYODIDE_URL })
    await py.loadPackage('pandas') // plotly.express lo requiere
    await py.loadPackage('micropip')
    await py.pyimport('micropip').install('plotly')
    return py
  })()
  // Si la carga falla (red), se permite reintentar en la siguiente ejecución.
  pyodidePromise.catch(() => {
    pyodidePromise = null
  })
  return pyodidePromise
}

/**
 * Ejecuta el código Python del usuario con `rows` (filas del dataset) y
 * `params` (valores de los controles interactivos, ver ChartSpec.params) en
 * scope, y devuelve la figura Plotly que dejó en la variable `fig`.
 */
export async function runPythonFigure(
  code: string,
  rows: Record<string, unknown>[],
  params: Record<string, unknown> = {},
): Promise<PlotlyFigure> {
  const py = await loadRuntime()
  py.globals.set('_rows_json', JSON.stringify(rows))
  py.globals.set('_params_json', JSON.stringify(params))
  // `fig` se limpia antes de cada corrida para que una figura vieja no
  // enmascare un código que dejó de definirla.
  await py.runPythonAsync(
    'import json\n' +
      'rows = json.loads(_rows_json)\n' +
      'params = json.loads(_params_json)\n' +
      'globals().pop("fig", None)',
  )
  await py.runPythonAsync(code)
  const figJson = (await py.runPythonAsync(
    "fig.to_json() if globals().get('fig') is not None else None",
  )) as string | null
  if (!figJson) {
    throw new Error('El código debe definir una variable `fig` (figura de Plotly).')
  }
  return JSON.parse(figJson) as PlotlyFigure
}
