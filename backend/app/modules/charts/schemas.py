"""Schemas de entrada/salida del módulo charts (§6.5)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.modules.charts.models import ChartStatus
from app.modules.charts.spec import ChartSpec
from app.modules.datasets.schemas import PreviewResult
from app.modules.tags.schemas import TagRead


class ChartSpecPayload(BaseModel):
    """Cuerpo de POST /validate: la spec cruda se parsea en el service para
    devolver errores legibles en vez de un 422 genérico."""

    chart_spec: dict[str, Any]


class ChartSpecPreviewRequest(BaseModel):
    """Cuerpo de POST /preview: spec sin guardar + params del dataset (si su SQL
    usa parámetros nombrados)."""

    chart_spec: dict[str, Any]
    params: dict[str, Any] = Field(default_factory=dict)


class ChartPreviewResult(PreviewResult):
    """Resultado de preview por spec: filas + la consulta generada (RF-08,
    visible solo como referencia, nunca editable) y advertencias de validación."""

    generated_sql: str
    warnings: list[str] = Field(default_factory=list)


class ChartCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    # El dataset y el tipo viven DENTRO de la spec (única fuente de verdad).
    chart_spec: ChartSpec
    tag_ids: list[uuid.UUID] = Field(default_factory=list)


class ChartUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    chart_spec: ChartSpec | None = None
    # Comentario opcional que queda registrado en la versión (RF-12).
    change_comment: str | None = Field(default=None, max_length=500)
    tag_ids: list[uuid.UUID] | None = None
    # Estado editable (RF-10): borrador / en revisión / aprobada / archivada.
    status: ChartStatus | None = None


class ChartVersionRead(BaseModel):
    id: uuid.UUID
    chart_id: uuid.UUID
    version_number: int
    chart_spec: dict[str, Any]
    change_comment: str | None
    created_by: str | None
    created_by_email: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChartRead(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    description: str | None
    renderer: str
    chart_type: str
    chart_spec: dict[str, Any]
    status: str
    tags: list[TagRead] = Field(default_factory=list)
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
