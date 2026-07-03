import type {
  DashboardCreate,
  DashboardDetail,
  DashboardItemPayload,
  DashboardItemRead,
  DashboardRead,
  DashboardUpdate,
} from '@/types/dashboards'

const BASE = '/api/admin/dashboards'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export async function listDashboards(): Promise<DashboardRead[]> {
  return parseResponse(await fetch(BASE))
}

export async function getDashboard(id: string): Promise<DashboardDetail> {
  return parseResponse(await fetch(`${BASE}/${id}`))
}

export async function createDashboard(data: DashboardCreate): Promise<DashboardRead> {
  return parseResponse(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function updateDashboard(id: string, data: DashboardUpdate): Promise<DashboardRead> {
  return parseResponse(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function deleteDashboard(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Error al eliminar: ${res.status}`)
}

/** Reemplazo en bloque de los items del tablero (layout + config por item). */
export async function replaceItems(
  id: string,
  items: DashboardItemPayload[],
): Promise<DashboardItemRead[]> {
  return parseResponse(
    await fetch(`${BASE}/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
  )
}
