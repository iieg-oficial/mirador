"""Mixin base para todas las tablas de metadata.

Convención (ver `docs/database.md` y `CLAUDE.md`): toda tabla usa `id: UUID`,
`created_at`, `updated_at`, y registra autoría con el `sub` de Minerva en
`created_by` (+ `created_by_email` para legibilidad). NO existen tablas locales
de identidad; la autorización vive en Minerva.
"""

import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UUIDAuditBase(SQLModel):
    """Campos comunes. Las tablas concretas heredan y agregan `table=True`."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, nullable=False)
    updated_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={"onupdate": utcnow},
    )
    # `sub` de Minerva del autor (nullable: filas creadas por el sistema/seed).
    created_by: str | None = Field(default=None, index=True)
    created_by_email: str | None = Field(default=None)
