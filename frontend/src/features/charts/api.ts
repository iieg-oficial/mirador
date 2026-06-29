import type { Chart, ChartCreate, ChartUpdate } from '@/types/charts'
import type { PreviewResult } from '@/types/datasets'

const BASE = '/api/admin/charts'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export async function listCharts(): Promise<Chart[]> {
  return parseResponse(await fetch(BASE))
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

export async function previewChart(id: string): Promise<PreviewResult> {
  return parseResponse(await fetch(`${BASE}/${id}/preview`, { method: 'POST' }))
}
