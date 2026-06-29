"""charts: tabla charts (§6.5)

Revision ID: 0003_charts
Revises: 0002_datasets
Create Date: 2026-06-29

Crea la tabla `charts`. Los campos `field_mapping` y `visual_config` son JSONB
(especificación JSON del renderer echarts).
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_charts"
down_revision: Union[str, None] = "0002_datasets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "charts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column(
            "renderer",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default="echarts",
        ),
        sa.Column("chart_type", sqlmodel.sql.sqltypes.AutoString(length=40), nullable=False),
        sa.Column(
            "field_mapping",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "visual_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default="draft",
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_charts_dataset_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_charts_dataset_id", "charts", ["dataset_id"])
    op.create_index("ix_charts_name", "charts", ["name"])
    op.create_index("ix_charts_created_by", "charts", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_charts_created_by", table_name="charts")
    op.drop_index("ix_charts_name", table_name="charts")
    op.drop_index("ix_charts_dataset_id", table_name="charts")
    op.drop_table("charts")
