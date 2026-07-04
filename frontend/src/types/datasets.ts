import type { Tag } from '@/types/tags'

export type DatasetStatus = 'draft' | 'validated' | 'published' | 'archived'

// Tipo semántico inferido por el backend (editable a mano vía DatasetUpdate).
export type SemanticType =
  | 'categorica'
  | 'metrica'
  | 'temporal'
  | 'geografica'
  | 'identificador'
  | 'texto'
  | 'booleano'

export const SEMANTIC_TYPE_LABELS: Record<SemanticType, string> = {
  categorica: 'Dimensión categórica',
  metrica: 'Métrica numérica',
  temporal: 'Campo temporal',
  geografica: 'Campo geográfico',
  identificador: 'Identificador',
  texto: 'Texto descriptivo',
  booleano: 'Booleano',
}

export interface ColumnMeta {
  name: string
  data_type: string
  semantic_type?: SemanticType | null
  label?: string | null
  is_dimension?: boolean | null
  is_metric?: boolean | null
  aggregations?: string[] | null
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
  tags: Tag[]
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
  tag_ids?: string[]
}

export interface DatasetUpdate {
  name?: string
  description?: string | null
  sql_query?: string
  cache_ttl_seconds?: number
  max_rows?: number
  status?: DatasetStatus
  tag_ids?: string[]
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
