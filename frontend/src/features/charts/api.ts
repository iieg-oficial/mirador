import type { Chart, ChartCreate, ChartSpec, ChartUpdate, ChartVersion } from '@/types/charts'
import type { PreviewResult } from '@/types/datasets'

const BASE = '/api/admin/charts'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export interface ChartValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ChartPreviewResult extends PreviewResult {
  generated_sql: string
  warnings: string[]
}

export async function listCharts(filters?: { q?: string; tagIds?: string[] }): Promise<Chart[]> {
  const params = new URLSearchParams()
  if (filters?.q) params.set('q', filters.q)
  for (const id of filters?.tagIds ?? []) params.append('tag_ids', id)
  const qs = params.toString()
  return parseResponse(await fetch(qs ? `${BASE}?${qs}` : BASE))
}

export async function getChart(id: string): Promise<Chart> {
  return parseResponse(await fetch(`${BASE}/${id}`))
}

export async function createChart(data: ChartCreate): Promise<Chart> {
  return parseResponse(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function updateChart(id: string, data: ChartUpdate): Promise<Chart> {
  return parseResponse(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function deleteChart(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Error al eliminar: ${res.status}`)
}

/** Valida una spec (o JSON arbitrario del editor avanzado) sin guardarla. */
export async function validateSpec(
  spec: ChartSpec | Record<string, unknown>,
): Promise<ChartValidation> {
  return parseResponse(
    await fetch(`${BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart_spec: spec }),
    }),
  )
}

/** Previsualiza una spec sin guardarla: el backend genera y ejecuta la
 * consulta segura (agregación server-side) y devuelve filas + SQL generado. */
export async function previewSpec(
  spec: ChartSpec | Record<string, unknown>,
  params: Record<string, unknown> = {},
): Promise<ChartPreviewResult> {
  return parseResponse(
    await fetch(`${BASE}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart_spec: spec, params }),
    }),
  )
}

/** Previsualiza una gráfica guardada (ejecuta su spec persistida). */
export async function previewChart(id: string): Promise<ChartPreviewResult> {
  return parseResponse(await fetch(`${BASE}/${id}/preview`, { method: 'POST' }))
}

/** Clona una gráfica como recurso independiente (RF-11). */
export async function cloneChart(id: string): Promise<Chart> {
  return parseResponse(await fetch(`${BASE}/${id}/clone`, { method: 'POST' }))
}

/** Historial de versiones, de la más reciente a la más antigua (RF-12). */
export async function listVersions(id: string): Promise<ChartVersion[]> {
  return parseResponse(await fetch(`${BASE}/${id}/versions`))
}

/** Restaura una versión anterior; el spec vigente queda en el historial. */
export async function restoreVersion(id: string, versionId: string): Promise<Chart> {
  return parseResponse(await fetch(`${BASE}/${id}/restore/${versionId}`, { method: 'POST' }))
}
