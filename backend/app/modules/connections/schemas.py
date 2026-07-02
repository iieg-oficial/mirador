"""Esquemas de entrada/salida del módulo de conexiones.

Separación clave (§9.1): la contraseña entra en texto plano (`ConnectionCreate`/
`ConnectionUpdate`) pero NUNCA sale. `ConnectionRead` jamás incluye
`encrypted_password` ni una cadena de conexión.
"""

import enum
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.connections.models import ConnectionEngine, ConnectionStatus

# Valores válidos de `sslmode` de libpq/psycopg.
SSLMode = Literal["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]


class ConnectionCreate(BaseModel):
    """Alta de conexión. `password` viaja en claro solo en el request."""

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    engine: ConnectionEngine = ConnectionEngine.postgresql
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(min_length=1, max_length=255)
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)
    ssl_enabled: bool = False
    ssl_mode: SSLMode | None = None
    read_only: bool = True


class ConnectionUpdate(BaseModel):
    """Edición parcial. `password` opcional: si viene, se recifra."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    engine: ConnectionEngine | None = None
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1)
    ssl_enabled: bool | None = None
    ssl_mode: SSLMode | None = None
    read_only: bool | None = None
    status: ConnectionStatus | None = None


class ConnectionRead(BaseModel):
    """Vista segura para el frontend. Sin secretos ni cadena de conexión."""

    id: uuid.UUID
    name: str
    description: str | None
    engine: ConnectionEngine
    host: str
    port: int
    database: str
    username: str
    ssl_enabled: bool
    ssl_mode: str | None
    read_only: bool
    status: ConnectionStatus
    last_test_error: str | None
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectionTestResult(BaseModel):
    """Resultado de probar una conexión."""

    success: bool
    status: ConnectionStatus
    detail: str | None = None


# ── Exploración de esquema ────────────────────────────────────────────────────


class SchemaObjectType(str, enum.Enum):
    table = "table"
    view = "view"
    materialized_view = "materialized_view"


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool
    default: str | None = None


class SchemaObject(BaseModel):
    name: str
    type: SchemaObjectType


class SchemaGroup(BaseModel):
    """Un esquema de PostgreSQL con sus objetos (tablas, vistas, vistas mat.)."""

    name: str
    objects: list[SchemaObject]


class SchemaResponse(BaseModel):
    schemas: list[SchemaGroup]
