"""Modelo de gráfica: visualización vinculada a un dataset (§6.5).

Una gráfica se guarda como especificación JSON independiente del renderer:
renderer, chart_type, field_mapping, visual_config.
"""

import uuid

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.shared.models import UUIDAuditBase


class Chart(UUIDAuditBase, table=True):
    """Gráfica persistida como spec JSON (renderer echarts + tipo + mapeo de campos)."""

    __tablename__ = "charts"

    dataset_id: uuid.UUID = Field(foreign_key="datasets.id", index=True)
    name: str = Field(index=True, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    renderer: str = Field(default="echarts", max_length=20)
    chart_type: str = Field(max_length=40)
    field_mapping: dict = Field(
        sa_column=Column(JSONB, nullable=False, server_default="{}")
    )
    visual_config: dict = Field(
        sa_column=Column(JSONB, nullable=False, server_default="{}")
    )
    status: str = Field(default="draft", max_length=20)
