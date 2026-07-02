"""Schemas de entrada/salida del módulo charts (§6.5)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChartSpecPayload(BaseModel):
    """Cuerpo de POST /validate: la spec cruda se parsea en el service para
    devolver errores legibles en vez de un 422 genérico."""

    chart_spec: dict[str, Any]


class ChartCreate(BaseModel):
    dataset_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    chart_type: str = Field(min_length=1, max_length=40)
    field_mapping: dict[str, Any]
    visual_config: dict[str, Any] = Field(default_factory=dict)


class ChartUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    chart_type: str | None = Field(default=None, max_length=40)
    field_mapping: dict[str, Any] | None = None
    visual_config: dict[str, Any] | None = None
    # `status` no se expone aquí: no hay flujo de publicación de gráficas todavía.
    # La máquina de estados llegará con la fase de dashboards.


class ChartRead(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    description: str | None
    renderer: str
    chart_type: str
    field_mapping: dict[str, Any]
    visual_config: dict[str, Any]
    status: str
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
