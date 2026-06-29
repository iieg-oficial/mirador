export type DatasetStatus = 'draft' | 'validated' | 'published' | 'archived'

export interface ColumnMeta {
  name: string
  data_type: string
}

export interface Dataset {
  id: string
  connection_id: string
  name: string
  slug: string
  description: string | null
  sql_query: string
  parameters_schema: { params: { name: string }[] } | null
  columns_schema: { columns: ColumnMeta[] } | null
  cache_ttl_seconds: number
  max_rows: number
  status: DatasetStatus
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface DatasetCreate {
  connection_id: string
  name: string
  slug: string
  description?: string | null
  sql_query: string
  cache_ttl_seconds?: number
  max_rows?: number
}

export interface DatasetUpdate {
  name?: string
  description?: string | null
  sql_query?: string
  cache_ttl_seconds?: number
  max_rows?: number
  status?: DatasetStatus
}

export interface PlaygroundRequest {
  connection_id: string
  sql: string
  params?: Record<string, unknown>
  max_rows?: number
}

export interface PreviewResult {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  total_rows: number | null
  truncated: boolean
  elapsed_ms: number
}
