"""Schemas de entrada/salida del módulo charts (§6.5)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.modules.charts.spec import ChartSpec
from app.modules.datasets.schemas import PreviewResult


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


class ChartUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    chart_spec: ChartSpec | None = None
    # Comentario opcional que queda registrado en la versión (RF-12).
    change_comment: str | None = Field(default=None, max_length=500)
    # `status` no se expone aquí: no hay flujo de publicación de gráficas todavía.
    # La máquina de estados llegará con la fase de dashboards.


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
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
