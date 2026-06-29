"""Modelo de dataset: consulta SQL guardada sobre una conexión (§6.3).

Un dataset es la capa de datos reutilizable entre conexiones y gráficas.
Estados: draft → validated → published → archived.
"""

import enum
import uuid

from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.shared.models import UUIDAuditBase


class DatasetStatus(str, enum.Enum):
    draft = "draft"
    validated = "validated"
    published = "published"
    archived = "archived"


class Dataset(UUIDAuditBase, table=True):
    """Consulta SQL guardada, validada y parametrizable."""

    __tablename__ = "datasets"

    connection_id: uuid.UUID = Field(foreign_key="connections.id", index=True)
    name: str = Field(index=True, max_length=120)
    slug: str = Field(unique=True, max_length=120, index=True)
    description: str | None = Field(default=None, max_length=500)
    # TEXT sin límite — las queries pueden ser largas.
    sql_query: str = Field(sa_column=Column(Text, nullable=False))
    # Esquema inferido de parámetros y columnas tras validar: {"params": [...], "columns": [...]}
    parameters_schema: dict | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    columns_schema: dict | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    cache_ttl_seconds: int = Field(default=300)
    max_rows: int = Field(default=1000)
    status: DatasetStatus = Field(default=DatasetStatus.draft)
