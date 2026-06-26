"""initial: tabla connections (Bloque C)

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-26

Crea la tabla `connections` (§6.2). Los campos `engine` y `status` son ENUMs
nativos de Postgres. La contraseña se guarda cifrada en `encrypted_password`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column(
            "engine",
            sa.Enum("postgresql", "postgis", "duckdb", name="connectionengine"),
            nullable=False,
        ),
        sa.Column("host", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("database", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("username", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("encrypted_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("ssl_enabled", sa.Boolean(), nullable=False),
        sa.Column("read_only", sa.Boolean(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("activa", "inactiva", "error", "archivada", name="connectionstatus"),
            nullable=False,
        ),
        sa.Column(
            "last_test_error",
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_connections_created_by"), "connections", ["created_by"], unique=False)
    op.create_index(op.f("ix_connections_name"), "connections", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_connections_name"), table_name="connections")
    op.drop_index(op.f("ix_connections_created_by"), table_name="connections")
    op.drop_table("connections")
    # Los ENUMs nativos quedan huérfanos tras drop_table; eliminarlos explícito.
    sa.Enum(name="connectionengine").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="connectionstatus").drop(op.get_bind(), checkfirst=True)
