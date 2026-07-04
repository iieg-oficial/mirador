"""Modelo de etiquetas (tags) para catalogar Connection/Dataset/Chart.

Con decenas de conexiones y sus datasets/gráficas, las listas planas dejan de
ser navegables. Las etiquetas son libres (no jerárquicas): una misma entidad
puede tener varias, y se filtra por combinación de etiquetas + texto en cada
módulo (ver `list_connections`/`list_datasets`/`list_charts`).

Las tablas de enlace son muchos-a-muchos, con `ondelete=CASCADE` en ambos
lados: borrar una entidad limpia sus enlaces, y borrar un tag limpia sus
enlaces sin tocar las entidades etiquetadas.
"""

import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.shared.models import UUIDAuditBase

# Preset fijo de colores para los badges (claves de la paleta por defecto de
# Tailwind, ya disponible en el frontend sin declarar nada nuevo en el theme).
# Con 50+ tags un color libre por tag vuelve la UI ilegible; un set fijo la
# mantiene consistente.
TAG_COLORS = ("purple", "orange", "blue", "green", "red", "amber", "teal", "gray")


class Tag(UUIDAuditBase, table=True):
    __tablename__ = "tags"

    name: str = Field(unique=True, index=True, max_length=60)
    color: str = Field(default="gray", max_length=20)


class ConnectionTag(UUIDAuditBase, table=True):
    __tablename__ = "connection_tags"
    __table_args__ = (UniqueConstraint("connection_id", "tag_id"),)

    connection_id: uuid.UUID = Field(foreign_key="connections.id", index=True, ondelete="CASCADE")
    tag_id: uuid.UUID = Field(foreign_key="tags.id", index=True, ondelete="CASCADE")


class DatasetTag(UUIDAuditBase, table=True):
    __tablename__ = "dataset_tags"
    __table_args__ = (UniqueConstraint("dataset_id", "tag_id"),)

    dataset_id: uuid.UUID = Field(foreign_key="datasets.id", index=True, ondelete="CASCADE")
    tag_id: uuid.UUID = Field(foreign_key="tags.id", index=True, ondelete="CASCADE")


class ChartTag(UUIDAuditBase, table=True):
    __tablename__ = "chart_tags"
    __table_args__ = (UniqueConstraint("chart_id", "tag_id"),)

    chart_id: uuid.UUID = Field(foreign_key="charts.id", index=True, ondelete="CASCADE")
    tag_id: uuid.UUID = Field(foreign_key="tags.id", index=True, ondelete="CASCADE")
