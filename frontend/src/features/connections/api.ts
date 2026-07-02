import type {
  ColumnInfo,
  Connection,
  ConnectionCreate,
  ConnectionTestResult,
  ConnectionUpdate,
  SchemaResponse,
} from '@/types/connections'

const BASE = '/api/admin/connections'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json() as Promise<T>
}

export async function listConexiones(): Promise<Connection[]> {
  return parseResponse(await fetch(BASE))
}

export async function createConexion(data: ConnectionCreate): Promise<Connection> {
  return parseResponse(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function updateConexion(id: string, data: ConnectionUpdate): Promise<Connection> {
  return parseResponse(
    await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export async function deleteConexion(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Error al eliminar: ${res.status}`)
}

export async function testConexion(id: string): Promise<ConnectionTestResult> {
  return parseResponse(await fetch(`${BASE}/${id}/test`, { method: 'POST' }))
}

export async function getSchema(id: string): Promise<SchemaResponse> {
  return parseResponse(await fetch(`${BASE}/${id}/schema`))
}

export async function getColumns(
  id: string,
  schemaName: string,
  objectName: string,
): Promise<ColumnInfo[]> {
  return parseResponse(
    await fetch(`${BASE}/${id}/schema/${encodeURIComponent(schemaName)}/${encodeURIComponent(objectName)}/columns`),
  )
}
