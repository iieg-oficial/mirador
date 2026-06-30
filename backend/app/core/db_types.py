"""Tipos de columna compartidos entre módulos.

JSONB es exclusivo de PostgreSQL; SQLite (motor de los tests, ver
`app/tests/conftest.py`) no lo soporta. `JSONVariant` resuelve a JSONB en
Postgres y a JSON genérico en cualquier otro dialecto, sin tocar la migración
de Alembic (que sigue declarando JSONB explícitamente para producción).
"""

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

JSONVariant = JSON().with_variant(JSONB, "postgresql")
