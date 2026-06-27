export type ConnectionEngine = 'postgresql' | 'postgis' | 'duckdb'
export type ConnectionStatus = 'activa' | 'inactiva' | 'error' | 'archivada'
export type SchemaObjectType = 'table' | 'view' | 'materialized_view'

export interface Connection {
  id: string
  name: string
  description: string | null
  engine: ConnectionEngine
  host: string
  port: number
  database: string
  username: string
  ssl_enabled: boolean
  read_only: boolean
  status: ConnectionStatus
  last_test_error: string | null
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface ConnectionCreate {
  name: string
  description?: string | null
  engine: ConnectionEngine
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl_enabled: boolean
  read_only: boolean
}

export interface ConnectionUpdate {
  name?: string
  description?: string | null
  engine?: ConnectionEngine
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl_enabled?: boolean
  read_only?: boolean
}

export interface ConnectionTestResult {
  success: boolean
  status: ConnectionStatus
  detail: string | null
}

export interface SchemaObject {
  name: string
  type: SchemaObjectType
}

export interface SchemaGroup {
  name: string
  objects: SchemaObject[]
}

export interface SchemaResponse {
  schemas: SchemaGroup[]
}

export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default: string | null
}
