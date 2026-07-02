"""datasets: índice único parcial de slug (excluye archivados)

Revision ID: 0004_dataset_slug_partial_unique
Revises: 0003_charts
Create Date: 2026-06-30

El slug era único globalmente (UniqueConstraint + índice único), por lo que un
dataset archivado (borrado lógico) seguía ocupando su slug para siempre y
bloqueaba recrear un dataset con el mismo nombre (REVISION_CODIGO.md #5).
Se reemplaza por un índice único parcial que excluye `status = 'archived'`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_dataset_slug_partial_unique"
down_revision: Union[str, None] = "0003_charts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("datasets_slug_key", "datasets", type_="unique")
    op.drop_index(op.f("ix_datasets_slug"), table_name="datasets")
    op.create_index(
        op.f("ix_datasets_slug"),
        "datasets",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("status != 'archived'"),
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_datasets_slug"), table_name="datasets", postgresql_where=sa.text("status != 'archived'"))
    op.create_index(op.f("ix_datasets_slug"), "datasets", ["slug"], unique=True)
    op.create_unique_constraint("datasets_slug_key", "datasets", ["slug"])
