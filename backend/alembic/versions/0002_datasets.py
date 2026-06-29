"""datasets: tabla datasets (§6.3)

Revision ID: 0002_datasets
Revises: 0001_initial
Create Date: 2026-06-26

Crea la tabla `datasets`. El campo `sql_query` es TEXT sin límite. Los campos
`parameters_schema` y `columns_schema` son JSONB (metadatos inferidos).
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0002_datasets"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column("sql_query", sa.Text(), nullable=False),
        sa.Column("parameters_schema", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("columns_schema", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("cache_ttl_seconds", sa.Integer(), nullable=False),
        sa.Column("max_rows", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "validated", "published", "archived", name="datasetstatus"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["connection_id"], ["connections.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(op.f("ix_datasets_connection_id"), "datasets", ["connection_id"], unique=False)
    op.create_index(op.f("ix_datasets_created_by"), "datasets", ["created_by"], unique=False)
    op.create_index(op.f("ix_datasets_name"), "datasets", ["name"], unique=False)
    op.create_index(op.f("ix_datasets_slug"), "datasets", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_datasets_slug"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_name"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_created_by"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_connection_id"), table_name="datasets")
    op.drop_table("datasets")
    sa.Enum(name="datasetstatus").drop(op.get_bind(), checkfirst=True)
