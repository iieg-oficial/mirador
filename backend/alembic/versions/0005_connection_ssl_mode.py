"""connections: columna ssl_mode (sslmode explícito por conexión)

Revision ID: 0005_connection_ssl_mode
Revises: 0004_dataset_slug_partial_unique
Create Date: 2026-07-01

Permite fijar el `sslmode` de psycopg por conexión (incluido `verify-full`, TLS
estricto). Nullable: si es NULL se deriva de `ssl_enabled` (require/prefer),
manteniendo el comportamiento previo.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_connection_ssl_mode"
down_revision: Union[str, None] = "0004_dataset_slug_partial_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("connections", sa.Column("ssl_mode", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("connections", "ssl_mode")
