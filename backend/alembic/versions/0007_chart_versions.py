"""charts: tabla chart_versions (historial de specs, RF-12)

Revision ID: 0007_chart_versions
Revises: 0006_chart_spec
Create Date: 2026-07-01

Cada fila es el snapshot del spec ANTERIOR de una gráfica, tomado al
actualizarla; permite restaurar versiones y conservar autoría del cambio.
"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_chart_versions"
down_revision: Union[str, None] = "0006_chart_spec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chart_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_by_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("chart_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("chart_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "change_comment", sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True
        ),
        sa.ForeignKeyConstraint(["chart_id"], ["charts.id"], name="fk_chart_versions_chart_id"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chart_id", "version_number"),
    )
    op.create_index("ix_chart_versions_chart_id", "chart_versions", ["chart_id"])


def downgrade() -> None:
    op.drop_index("ix_chart_versions_chart_id", table_name="chart_versions")
    op.drop_table("chart_versions")
