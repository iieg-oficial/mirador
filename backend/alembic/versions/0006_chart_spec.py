"""charts: chart_spec JSONB como formato canónico (laboratorio de datos)

Revision ID: 0006_chart_spec
Revises: 0005_connection_ssl_mode
Create Date: 2026-07-01

Reemplaza field_mapping + visual_config por una ChartSpec 1.0 versionada
(version/data/visual/encodings/interactions/style). El backfill construye la
spec desde las columnas viejas; el downgrade hace la conversión inversa.
`chart_type` se conserva como columna denormalizada para listados.
"""

import json
from typing import Any, Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_chart_spec"
down_revision: Union[str, None] = "0005_connection_ssl_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _as_encodings(value: Any) -> list[dict]:
    """Normaliza x/y del field_mapping viejo (str o lista de str) a encodings."""
    if isinstance(value, str) and value:
        return [{"field": value}]
    if isinstance(value, list):
        return [{"field": v} for v in value if isinstance(v, str) and v]
    return []


def _to_spec(row: Any) -> dict:
    fm = row.field_mapping or {}
    vc = row.visual_config or {}
    encodings: dict[str, Any] = {
        "x": _as_encodings(fm.get("x")),
        "y": _as_encodings(fm.get("y")),
    }
    if isinstance(fm.get("series"), str) and fm["series"]:
        encodings["color"] = {"field": fm["series"]}
    if isinstance(fm.get("fields"), dict):
        encodings["fields"] = {k: v for k, v in fm["fields"].items() if isinstance(v, str)}
    return {
        "version": "1.0",
        "data": {"dataset_id": str(row.dataset_id), "filters": [], "sort": [], "limit": 1000},
        "visual": {
            "chart_type": row.chart_type,
            "title": vc.get("title"),
            "subtitle": vc.get("subtitle"),
        },
        "encodings": encodings,
        "interactions": {
            "tooltip": True,
            "legend": bool(vc.get("show_legend", True)),
            "zoom": False,
            "download": False,
        },
        "style": {
            "theme": "institutional",
            "show_labels": False,
            "orientation": "vertical",
            "legend_position": vc.get("legend_position") or "top",
        },
    }


def _to_legacy(spec: dict) -> tuple[dict, dict]:
    """Conversión inversa (downgrade): spec → (field_mapping, visual_config)."""
    enc = spec.get("encodings", {})
    fm: dict[str, Any] = {
        "x": [e["field"] for e in enc.get("x", [])],
        "y": [e["field"] for e in enc.get("y", [])],
    }
    if enc.get("color"):
        fm["series"] = enc["color"]["field"]
    if enc.get("fields"):
        fm["fields"] = enc["fields"]
    visual = spec.get("visual", {})
    vc = {
        "title": visual.get("title"),
        "subtitle": visual.get("subtitle"),
        "show_legend": spec.get("interactions", {}).get("legend", True),
        "legend_position": spec.get("style", {}).get("legend_position", "top"),
    }
    return fm, vc


def upgrade() -> None:
    op.add_column(
        "charts",
        sa.Column("chart_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, dataset_id, chart_type, field_mapping, visual_config FROM charts")
    )
    for row in rows:
        conn.execute(
            sa.text("UPDATE charts SET chart_spec = CAST(:spec AS JSONB) WHERE id = :id"),
            {"spec": json.dumps(_to_spec(row)), "id": row.id},
        )

    op.alter_column("charts", "chart_spec", nullable=False)
    op.drop_column("charts", "field_mapping")
    op.drop_column("charts", "visual_config")


def downgrade() -> None:
    op.add_column(
        "charts",
        sa.Column(
            "field_mapping",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "charts",
        sa.Column(
            "visual_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, chart_spec FROM charts"))
    for row in rows:
        spec = row.chart_spec if isinstance(row.chart_spec, dict) else json.loads(row.chart_spec)
        fm, vc = _to_legacy(spec)
        conn.execute(
            sa.text(
                "UPDATE charts SET field_mapping = CAST(:fm AS JSONB), "
                "visual_config = CAST(:vc AS JSONB) WHERE id = :id"
            ),
            {"fm": json.dumps(fm), "vc": json.dumps(vc), "id": row.id},
        )

    op.drop_column("charts", "chart_spec")
