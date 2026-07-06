"""Schemas de entrada/salida del módulo datasets (§6.3)."""

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.datasets.models import DatasetStatus
from app.modules.tags.schemas import TagRead

_SLUG_RE = re.compile(r"^[a-z0-9_-]+$")

# Tipo semántico de una columna: guía al constructor de gráficas sobre cómo
# puede usarse el campo (dimensión, métrica, eje temporal, etc.).
SemanticType = Literal[
    "categorica",
    "metrica",
    "temporal",
    "geografica",
    "identificador",
    "texto",
    "booleano",
]

# Agregaciones que el query builder de charts sabe generar.
Aggregation = Literal["sum", "avg", "min", "max", "count", "count_distinct"]


class ColumnMeta(BaseModel):
    name: str
    data_type: str
    # Metadata semántica (opcional para compatibilidad con datasets previos).
    # Se infiere automáticamente al validar el dataset y es editable a mano.
    semantic_type: SemanticType | None = None
    label: str | None = Field(default=None, max_length=120)
    is_dimension: bool | None = None
    is_metric: bool | None = None
    aggregations: list[Aggregation] | None = None


class ColumnsSchemaPayload(BaseModel):
    """Payload de edición manual de la metadata semántica de columnas."""

    columns: list[ColumnMeta]


class DatasetCreate(BaseModel):
    connection_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    sql_query: str = Field(min_length=1)
    cache_ttl_seconds: int = Field(default=300, ge=0, le=86400)
    max_rows: int = Field(default=1000, ge=1, le=50000)
    tag_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError(
                "El slug solo puede contener letras minúsculas, números, guiones y guiones bajos."
            )
        return v


class DatasetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    sql_query: str | None = Field(default=None, min_length=1)
    cache_ttl_seconds: int | None = Field(default=None, ge=0, le=86400)
    max_rows: int | None = Field(default=None, ge=1, le=50000)
    status: DatasetStatus | None = None
    # Edición manual de metadata semántica de columnas: los nombres deben
    # existir en el schema inferido; el tipo físico (data_type) no es editable.
    columns_schema: ColumnsSchemaPayload | None = None
    tag_ids: list[uuid.UUID] | None = None


class DatasetRead(BaseModel):
    id: uuid.UUID
    connection_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    sql_query: str
    parameters_schema: dict | None
    columns_schema: dict | None
    cache_ttl_seconds: int
    max_rows: int
    status: DatasetStatus
    tags: list[TagRead] = Field(default_factory=list)
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Playground / ejecución ────────────────────────────────────────────────────


class PlaygroundRequest(BaseModel):
    """Petición de ejecución ad-hoc en el playground (sin dataset guardado)."""

    connection_id: uuid.UUID
    sql: str = Field(min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)
    max_rows: int = Field(default=100, ge=1, le=5000)


class PreviewRequest(BaseModel):
    """Petición de preview de un dataset guardado (usa su SQL y max_rows)."""

    params: dict[str, Any] = Field(default_factory=dict)


class PreviewResult(BaseModel):
    columns: list[ColumnMeta]
    rows: list[dict[str, Any]]
    total_rows: int | None
    truncated: bool
    elapsed_ms: float
