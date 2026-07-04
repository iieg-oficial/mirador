"""Modelo de dataset: consulta SQL guardada sobre una conexión (§6.3).

Un dataset es la capa de datos reutilizable entre conexiones y gráficas.
Estados: draft → validated → published → archived.
"""

import enum
import uuid

import sqlalchemy as sa
from sqlalchemy import Column, Index, Text
from sqlmodel import Field, Relationship

from app.core.db_types import JSONVariant
from app.modules.tags.models import DatasetTag, Tag
from app.shared.models import UUIDAuditBase


class DatasetStatus(str, enum.Enum):
    draft = "draft"
    validated = "validated"
    published = "published"
    archived = "archived"


class Dataset(UUIDAuditBase, table=True):
    """Consulta SQL guardada, validada y parametrizable."""

    __tablename__ = "datasets"
    __table_args__ = (
        # El slug solo debe ser único entre datasets no archivados (REVISION_CODIGO.md
        # #5): un dataset archivado no debe bloquear ese slug para siempre.
        Index(
            "ix_datasets_slug",
            "slug",
            unique=True,
            postgresql_where=sa.text("status != 'archived'"),
            sqlite_where=sa.text("status != 'archived'"),
        ),
    )

    connection_id: uuid.UUID = Field(foreign_key="connections.id", index=True)
    name: str = Field(index=True, max_length=120)
    # Sin unique=True/index=True aquí: la unicidad real es el índice parcial
    # de __table_args__ (excluye archivados).
    slug: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=500)
    # TEXT sin límite — las queries pueden ser largas.
    sql_query: str = Field(sa_column=Column(Text, nullable=False))
    # Esquema inferido de parámetros y columnas tras validar: {"params": [...], "columns": [...]}
    parameters_schema: dict | None = Field(
        default=None, sa_column=Column(JSONVariant, nullable=True)
    )
    columns_schema: dict | None = Field(default=None, sa_column=Column(JSONVariant, nullable=True))
    cache_ttl_seconds: int = Field(default=300)
    max_rows: int = Field(default=1000)
    status: DatasetStatus = Field(default=DatasetStatus.draft)
    tags: list[Tag] = Relationship(link_model=DatasetTag)
