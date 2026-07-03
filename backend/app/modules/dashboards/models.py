"""Modelos de tableros internos del laboratorio de datos (RF-13/RF-14).

Un dashboard es un grid de gráficas guardadas + widgets de texto. El layout
se persiste como configuración (JSON), nunca como HTML. Los filtros globales
viven en el dashboard y el frontend los aplica a las gráficas compatibles.
"""

import uuid
from enum import Enum

from sqlalchemy import Column
from sqlmodel import Field

from app.core.db_types import JSONVariant
from app.shared.models import UUIDAuditBase


class DashboardStatus(str, Enum):
    draft = "draft"
    archived = "archived"


class Dashboard(UUIDAuditBase, table=True):
    __tablename__ = "dashboards"

    name: str = Field(index=True, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: str = Field(default="draft", max_length=20)
    # Filtros globales: [{field, operator, value}] que el frontend mergea a las
    # gráficas cuyo dataset tenga el campo (RF-14).
    global_filters: list = Field(
        default_factory=list, sa_column=Column(JSONVariant, nullable=False, server_default="[]")
    )


class DashboardItem(UUIDAuditBase, table=True):
    """Elemento del grid: una gráfica o un bloque de markdown.

    position_config: {x, y, w, h} de react-grid-layout.
    local_config: en items "chart", {filters, variable_key} (filtros propios
    del item + nombre de variable para referenciarlo desde markdown si la
    Chart es kpi); en items "markdown", {content}. El backend no valida su
    forma interna, es responsabilidad del frontend.
    """

    __tablename__ = "dashboard_items"

    dashboard_id: uuid.UUID = Field(foreign_key="dashboards.id", index=True)
    chart_id: uuid.UUID | None = Field(default=None, foreign_key="charts.id")
    item_type: str = Field(default="chart", max_length=20)  # "chart" | "markdown"
    position_config: dict = Field(sa_column=Column(JSONVariant, nullable=False))
    local_config: dict = Field(
        default_factory=dict, sa_column=Column(JSONVariant, nullable=False, server_default="{}")
    )
