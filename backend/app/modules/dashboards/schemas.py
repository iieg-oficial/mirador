"""Schemas del módulo dashboards (tableros internos del laboratorio)."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ControlType = Literal["select", "multiselect", "year", "numrange", "daterange", "toggle", "text"]


class FilterOption(BaseModel):
    """Opción estática de un control select/multiselect."""

    value: Any
    label: str


class FilterTarget(BaseModel):
    """Mapea un filtro global al campo correspondiente en un item del tablero."""

    item_id: str
    field: str = Field(min_length=1, max_length=120)


class DashboardFilter(BaseModel):
    """Filtro global configurable (RF-14, §5.2).

    El backend solo persiste la definición (JSONB en `global_filters`); el
    frontend renderiza el control, resuelve las opciones y aplica el valor a
    los items indicados en `targets`. `id` es también el nombre de la variable
    `{{ filter.<id> }}` en Markdown.
    """

    id: str = Field(min_length=1, max_length=60)
    label: str = Field(min_length=1, max_length=120)
    control_type: ControlType
    # Origen de opciones: dataset (value/label fields) o lista estática.
    source_dataset_id: uuid.UUID | None = None
    value_field: str | None = Field(default=None, max_length=120)
    label_field: str | None = Field(default=None, max_length=120)
    options: list[FilterOption] = Field(default_factory=list)
    default_value: Any = None
    required: bool = False
    # Vacío → se aplica a todo item chart usando value_field/id como campo.
    targets: list[FilterTarget] = Field(default_factory=list)


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class DashboardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    # Filtros globales configurables (RF-14, §5.2).
    global_filters: list[DashboardFilter] | None = None


class PositionConfig(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class DashboardItemPayload(BaseModel):
    """Item del grid al guardar el layout (reemplazo en bloque)."""

    chart_id: uuid.UUID | None = None
    item_type: Literal["chart", "markdown"] = "chart"
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
