"""Modelo de gráfica: visualización vinculada a un dataset (§6.5).

Una gráfica se guarda como ChartSpec 1.0 (JSON versionado, independiente del
renderer). `dataset_id` y `chart_type` son denormalizados desde la spec para
FKs y listados; el service los mantiene sincronizados.
"""

import uuid

from sqlalchemy import Column
from sqlmodel import Field

from app.core.db_types import JSONVariant
from app.shared.models import UUIDAuditBase


class Chart(UUIDAuditBase, table=True):
    """Gráfica persistida como ChartSpec JSON (formato canónico del laboratorio)."""

    __tablename__ = "charts"

    dataset_id: uuid.UUID = Field(foreign_key="datasets.id", index=True)
    name: str = Field(index=True, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    renderer: str = Field(default="echarts", max_length=20)
    chart_type: str = Field(max_length=40)
    chart_spec: dict = Field(sa_column=Column(JSONVariant, nullable=False))
    status: str = Field(default="draft", max_length=20)
