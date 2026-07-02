"""Schemas del módulo dashboards (tableros internos del laboratorio)."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.charts.spec import FilterSpec


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class DashboardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    # Filtros globales (RF-14): mismos operadores validados que la ChartSpec.
    global_filters: list[FilterSpec] | None = None


class PositionConfig(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class DashboardItemPayload(BaseModel):
    """Item del grid al guardar el layout (reemplazo en bloque)."""

    chart_id: uuid.UUID | None = None
    item_type: Literal["chart", "text"] = "chart"
    position_config: PositionConfig
    local_config: dict[str, Any] = Field(default_factory=dict)


class DashboardItemsUpdate(BaseModel):
    items: list[DashboardItemPayload]


class DashboardItemRead(BaseModel):
    id: uuid.UUID
    dashboard_id: uuid.UUID
    chart_id: uuid.UUID | None
    item_type: str
    position_config: dict[str, Any]
    local_config: dict[str, Any]

    model_config = {"from_attributes": True}


class DashboardRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    global_filters: list[Any]
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardDetail(DashboardRead):
    items: list[DashboardItemRead] = Field(default_factory=list)
