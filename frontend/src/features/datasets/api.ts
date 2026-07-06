import type {
  Dataset,
  DatasetCreate,
  DatasetUpdate,
  PlaygroundRequest,
  PreviewResult,
} from '@/types/datasets'

const BASE = '/api/admin/datasets'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export async function listDatasets(filters?: { q?: string; tagIds?: string[] }): Promise<Dataset[]> {
  const params = new URLSearchParams()
  if (filters?.q) params.set('q', filters.q)
  for (const id of filters?.tagIds ?? []) params.append('tag_ids', id)
  const qs = params.toString()
  return parseResponse(await fetch(qs ? `${BASE}?${qs}` : BASE))
}

export async function getDataset(id: string): Promise<Dataset> {
  return parseResponse(await fetch(`${BASE}/${id}`))
}

export async function createDataset(data: DatasetCreate): Promise<Dataset> {
  return parseResponse(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function updateDataset(id: string, data: DatasetUpdate): Promise<Dataset> {
  return parseResponse(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function deleteDataset(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Error al eliminar: ${res.status}`)
}

export async function validateDataset(id: string): Promise<Dataset> {
  return parseResponse(await fetch(`${BASE}/${id}/validate`, { method: 'POST' }))
}

export async function previewDataset(
  id: string,
  params: Record<string, unknown> = {},
): Promise<PreviewResult> {
  return parseResponse(
    await fetch(`${BASE}/${id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    }),
  )
}

export async function runPlayground(body: PlaygroundRequest): Promise<PreviewResult> {
  return parseResponse(
    await fetch(`${BASE}/playground`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}
