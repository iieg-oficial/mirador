"""Schemas de entrada/salida del módulo datasets (§6.3)."""

import re
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.modules.datasets.models import DatasetStatus

_SLUG_RE = re.compile(r"^[a-z0-9_-]+$")


class DatasetCreate(BaseModel):
    connection_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    sql_query: str = Field(min_length=1)
    cache_ttl_seconds: int = Field(default=300, ge=0, le=86400)
    max_rows: int = Field(default=1000, ge=1, le=50000)

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError("El slug solo puede contener letras minúsculas, números, guiones y guiones bajos.")
        return v


class DatasetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    sql_query: str | None = Field(default=None, min_length=1)
    cache_ttl_seconds: int | None = Field(default=None, ge=0, le=86400)
    max_rows: int | None = Field(default=None, ge=1, le=50000)
    status: DatasetStatus | None = None


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


class ColumnMeta(BaseModel):
    name: str
    data_type: str


class PreviewResult(BaseModel):
    columns: list[ColumnMeta]
    rows: list[dict[str, Any]]
    total_rows: int | None
    truncated: bool
    elapsed_ms: float
