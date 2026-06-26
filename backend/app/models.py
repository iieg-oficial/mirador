"""Agregador de modelos para el autogenerate de Alembic.

Importa aquí el `models.py` de cada módulo para que sus tablas queden
registradas en `SQLModel.metadata` y Alembic las detecte. La base
`UUIDAuditBase` no es tabla, pero se importa para fijar el orden de carga.
"""

from app.shared.models import UUIDAuditBase  # noqa: F401

# A medida que se implementan los módulos, registrar sus tablas:
# from app.modules.connections.models import Connection  # noqa: F401  (Bloque C)
