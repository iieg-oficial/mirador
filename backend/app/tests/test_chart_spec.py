"""Tests del esquema ChartSpec 1.0: parseo, reglas por tipo y validación
contra el dataset (RF-06), más el endpoint POST /charts/validate."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modules.charts.spec import (
    ChartSpec,
    parse_spec,
    validate_spec_against_dataset,
)
from app.modules.datasets import service as datasets_service
from app.modules.datasets.models import Dataset, DatasetStatus

# ── Helpers ───────────────────────────────────────────────────────────────────

_COLUMNS = [
    {
        "name": "municipio",
        "data_type": "text",
        "semantic_type": "categorica",
        "is_dimension": True,
        "is_metric": False,
        "aggregations": ["count", "count_distinct"],
    },
    {
        "name": "poblacion",
        "data_type": "int8",
        "semantic_type": "metrica",
        "is_dimension": False,
        "is_metric": True,
        "aggregations": ["sum", "avg", "min", "max", "count"],
    },
    {
        "name": "anio",
        "data_type": "int4",
        "semantic_type": "metrica",
        "is_dimension": True,
        "is_metric": False,
        "aggregations": ["min", "max", "count"],
    },
]


def _dataset(columns: list[dict] | None = _COLUMNS) -> Dataset:
    return Dataset(
        connection_id=uuid.uuid4(),
        name="Población",
        slug="poblacion",
        sql_query="SELECT 1",
        columns_schema={"columns": columns} if columns is not None else None,
        status=DatasetStatus.validated,
    )


def _raw_spec(**overrides: Any) -> dict:
    base: dict[str, Any] = {
        "version": "1.0",
        "data": {"dataset_id": str(uuid.uuid4()), "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar", "title": "Población"},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }
    base.update(overrides)
    return base


def _parsed(**overrides: Any) -> ChartSpec:
    spec, errors = parse_spec(_raw_spec(**overrides))
    assert spec is not None, errors
    return spec


# ── Parseo del esquema ────────────────────────────────────────────────────────


def test_parse_spec_ok() -> None:
    spec = _parsed()
    assert spec.version == "1.0"
    assert spec.visual.chart_type == "bar"
    assert spec.data.limit == 100
    # Defaults de secciones opcionales.
    assert spec.interactions.tooltip is True
    assert spec.style.orientation == "vertical"


def test_parse_spec_bad_chart_type() -> None:
    spec, errors = parse_spec(_raw_spec(visual={"chart_type": "gauge"}))
    assert spec is None
    assert any("visual.chart_type" in e for e in errors)


def test_parse_spec_limit_out_of_range() -> None:
    raw = _raw_spec()
    raw["data"]["limit"] = 999999
    spec, errors = parse_spec(raw)
    assert spec is None
    assert any("data.limit" in e for e in errors)


def test_parse_spec_bad_filter_operator_value() -> None:
    raw = _raw_spec()
    raw["data"]["filters"] = [{"field": "anio", "operator": "in", "value": 2025}]
    spec, errors = parse_spec(raw)
    assert spec is None
    assert any("lista no vacía" in e for e in errors)

    raw["data"]["filters"] = [{"field": "anio", "operator": "is_null", "value": 1}]
    spec, errors = parse_spec(raw)
    assert spec is None

    raw["data"]["filters"] = [{"field": "anio", "operator": "between", "value": [1]}]
    spec, errors = parse_spec(raw)
    assert spec is None


# ── Validación contra dataset ─────────────────────────────────────────────────


def test_validate_ok_no_errors() -> None:
    errors, warnings = validate_spec_against_dataset(_parsed(), _dataset())
    assert errors == []
    assert warnings == []


def test_validate_unknown_column() -> None:
    spec = _parsed(encodings={"x": [{"field": "zzz"}], "y": [{"field": "poblacion"}]})
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("zzz" in e for e in errors)


def test_validate_aggregation_not_allowed() -> None:
    spec = _parsed(
        encodings={"x": [{"field": "municipio"}], "y": [{"field": "anio", "aggregation": "sum"}]}
    )
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("no permite la agregación 'sum'" in e for e in errors)


def test_validate_non_metric_y_warns() -> None:
    spec = _parsed(
        encodings={"x": [{"field": "municipio"}], "y": [{"field": "anio", "aggregation": "max"}]}
    )
    errors, warnings = validate_spec_against_dataset(spec, _dataset())
    assert errors == []
    assert any("no está marcada como métrica" in w for w in warnings)


def test_validate_without_columns_schema_skips_field_checks() -> None:
    spec = _parsed(encodings={"x": [{"field": "loquesea"}], "y": [{"field": "otra"}]})
    errors, _ = validate_spec_against_dataset(spec, _dataset(columns=None))
    assert errors == []


# ── Reglas por tipo ───────────────────────────────────────────────────────────


def test_bar_requires_x_and_y() -> None:
    spec = _parsed(encodings={"x": [], "y": []})
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert len(errors) == 2


def test_pie_single_dim_and_metric() -> None:
    spec = _parsed(
        visual={"chart_type": "pie"},
        encodings={
            "x": [{"field": "municipio"}, {"field": "anio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    )
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("admite solo una dimensión" in e for e in errors)


def test_pie_many_categories_warns() -> None:
    raw = _raw_spec(visual={"chart_type": "pie"})
    raw["data"]["limit"] = 100
    spec, _ = parse_spec(raw)
    assert spec is not None
    errors, warnings = validate_spec_against_dataset(spec, _dataset())
    assert errors == []
    assert any("ilegible" in w for w in warnings)


def test_kpi_requires_single_aggregated_metric() -> None:
    spec = _parsed(visual={"chart_type": "kpi"}, encodings={"y": [{"field": "poblacion"}]})
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("agregación" in e for e in errors)

    spec = _parsed(visual={"chart_type": "kpi"}, encodings={"y": []})
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("exactamente una métrica" in e for e in errors)


def test_table_requires_some_encoding() -> None:
    spec = _parsed(visual={"chart_type": "table"}, encodings={})
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("al menos una columna" in e for e in errors)

    spec = _parsed(
        visual={"chart_type": "table"},
        encodings={"tooltip": [{"field": "municipio"}]},
    )
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert errors == []


def test_candlestick_requires_named_fields() -> None:
    spec = _parsed(
        visual={"chart_type": "candlestick"},
        encodings={"x": [{"field": "municipio"}], "fields": {"open": "poblacion"}},
    )
    errors, _ = validate_spec_against_dataset(spec, _dataset())
    assert any("close" in e for e in errors)


# ── Endpoint POST /charts/validate ────────────────────────────────────────────

_CONNECTION_PAYLOAD = {
    "name": "DW Test",
    "engine": "postgresql",
    "host": "db.interno",
    "port": 5432,
    "database": "indicadores",
    "username": "lector",
    "password": "s3creto-real",
    "ssl_enabled": False,
    "read_only": True,
}

_DATASET_PAYLOAD = {
    "name": "Población municipal",
    "slug": "poblacion_municipal_spec",
    "sql_query": "SELECT municipio, poblacion FROM mart.poblacion",
    "max_rows": 1000,
    "cache_ttl_seconds": 300,
}


@pytest.fixture(autouse=True)
def _mock_infer_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return (
            [
                {"name": "municipio", "data_type": "text", **datasets_service.infer_semantics("municipio", "text")},
                {"name": "poblacion", "data_type": "int8", **datasets_service.infer_semantics("poblacion", "int8")},
            ],
            [],
        )

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)


def _create_dataset(client: TestClient) -> str:
    conn = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    assert conn.status_code == 201, conn.text
    ds = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": conn.json()["id"]}
    )
    assert ds.status_code == 201, ds.text
    return ds.json()["id"]


def test_validate_endpoint_valid_spec(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    raw = _raw_spec()
    raw["data"]["dataset_id"] = dataset_id
    res = client.post("/api/admin/charts/validate", json={"chart_spec": raw})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["valid"] is True
    assert body["errors"] == []


def test_validate_endpoint_schema_errors(client: TestClient) -> None:
    res = client.post("/api/admin/charts/validate", json={"chart_spec": {"version": "9.9"}})
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is False
    assert body["errors"]


def test_validate_endpoint_dataset_missing(client: TestClient) -> None:
    res = client.post("/api/admin/charts/validate", json={"chart_spec": _raw_spec()})
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is False
    assert any("dataset" in e.lower() for e in body["errors"])


def test_validate_endpoint_incompatible_spec(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    raw = _raw_spec(
        encodings={"x": [{"field": "municipio"}], "y": [{"field": "inexistente"}]}
    )
    raw["data"]["dataset_id"] = dataset_id
    res = client.post("/api/admin/charts/validate", json={"chart_spec": raw})
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is False
    assert any("inexistente" in e for e in body["errors"])
