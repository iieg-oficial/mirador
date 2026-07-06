"""tags: tabla tags y enlaces muchos-a-muchos con connections/datasets/charts

Revision ID: 0011_tags
Revises: 0010_dashboards
Create Date: 2026-07-04

Cataloga conexiones, datasets y gráficas con etiquetas libres (no
jerárquicas). Las tablas de enlace tienen `ondelete=CASCADE` en ambos lados:
borrar la entidad o el tag limpia el enlace sin afectar al otro lado.
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0011_tags"
down_revision: Union[str, None] = "0010_dashboards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LINKS = [
    ("connection_tags", "connection_id", "connections"),
    ("dataset_tags", "dataset_id", "datasets"),
    ("chart_tags", "chart_id", "charts"),
]


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=60), nullable=False),
        sa.Column(
            "color",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default="gray",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_index("ix_tags_created_by", "tags", ["created_by"])

    for table_name, owner_column, owner_table in _LINKS:
        op.create_table(
            table_name,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column(owner_column, sa.Uuid(), nullable=False),
            sa.Column("tag_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(
                [owner_column],
                [f"{owner_table}.id"],
                name=f"fk_{table_name}_{owner_column}",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["tag_id"], ["tags.id"], name=f"fk_{table_name}_tag_id", ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                owner_column, "tag_id", name=f"uq_{table_name}_{owner_column}_tag_id"
            ),
        )
        op.create_index(f"ix_{table_name}_{owner_column}", table_name, [owner_column])
        op.create_index(f"ix_{table_name}_tag_id", table_name, ["tag_id"])


def downgrade() -> None:
    for table_name, owner_column, _ in reversed(_LINKS):
        op.drop_index(f"ix_{table_name}_tag_id", table_name=table_name)
        op.drop_index(f"ix_{table_name}_{owner_column}", table_name=table_name)
        op.drop_table(table_name)

    op.drop_index("ix_tags_created_by", table_name="tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
