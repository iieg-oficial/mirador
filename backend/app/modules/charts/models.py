"""Modelo de gráfica: visualización vinculada a un dataset (§6.5).

Una gráfica se guarda como ChartSpec 1.0 (JSON versionado, independiente del
renderer). `dataset_id` y `chart_type` son denormalizados desde la spec para
FKs y listados; el service los mantiene sincronizados.
"""

import uuid

from sqlalchemy import Column, UniqueConstraint
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


class ChartVersion(UUIDAuditBase, table=True):
    """Snapshot del spec ANTERIOR de una gráfica, tomado en cada update que lo
    cambia (RF-12). created_by registra quién hizo el cambio."""

    __tablename__ = "chart_versions"
    __table_args__ = (UniqueConstraint("chart_id", "version_number"),)

    chart_id: uuid.UUID = Field(foreign_key="charts.id", index=True)
    version_number: int
    chart_spec: dict = Field(sa_column=Column(JSONVariant, nullable=False))
    change_comment: str | None = Field(default=None, max_length=500)
