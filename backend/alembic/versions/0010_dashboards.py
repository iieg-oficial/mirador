"""dashboards: tablas dashboards y dashboard_items (RF-13/RF-14)

Revision ID: 0010_dashboards
Revises: 0009_drop_dashboards
Create Date: 2026-07-02

Reconstruye el módulo de tableros internos del laboratorio, retirado en
0009_drop_dashboards por decisión de alcance (no por un bug concreto), ahora
con alcance acotado: solo laboratorio interno, sin publicación pública. El
esquema es idéntico al que dejó 0008_dashboards.
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_dashboards"
down_revision: Union[str, None] = "0009_drop_dashboards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "global_filters",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dashboards_name", "dashboards", ["name"])
    op.create_index("ix_dashboards_created_by", "dashboards", ["created_by"])

    op.create_table(
        "dashboard_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("dashboard_id", sa.Uuid(), nullable=False),
        sa.Column("chart_id", sa.Uuid(), nullable=True),
        sa.Column(
            "item_type",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default="chart",
        ),
        sa.Column("position_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "local_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.ForeignKeyConstraint(
            ["dashboard_id"],
            ["dashboards.id"],
            name="fk_dashboard_items_dashboard_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["chart_id"], ["charts.id"], name="fk_dashboard_items_chart_id"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dashboard_items_dashboard_id", "dashboard_items", ["dashboard_id"])


def downgrade() -> None:
    op.drop_index("ix_dashboard_items_dashboard_id", table_name="dashboard_items")
    op.drop_table("dashboard_items")
    op.drop_index("ix_dashboards_created_by", table_name="dashboards")
    op.drop_index("ix_dashboards_name", table_name="dashboards")
    op.drop_table("dashboards")
