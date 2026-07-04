"""Tests de API del módulo charts: CRUD sobre ChartSpec, validación contra el
dataset, preview de gráfica guardada y el gate `require_app_access`.

`_infer_schema` y `run_query` se mockean: requieren una conexión Postgres real,
fuera de alcance para estos tests (igual que en `test_datasets_api.py`).
"""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import CurrentUser
from app.modules.datasets import service as datasets_service
from app.modules.datasets.schemas import ColumnMeta, PreviewResult

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
    "slug": "poblacion_municipal",
    "sql_query": "SELECT municipio, anio FROM mart.poblacion",
    "max_rows": 1000,
    "cache_ttl_seconds": 300,
}

# Columnas que el dataset de prueba "expone" (superset para cubrir todos los tipos).
_SCHEMA_COLS = [
    "municipio", "anio", "fecha", "poblacion",
    "open", "close", "lowest", "highest",  # candlestick
    "vmin", "q1", "median", "q3", "vmax",  # boxplot
]


def _spec(dataset_id: str, **overrides: Any) -> dict:
    base: dict[str, Any] = {
        "version": "1.0",
        "data": {"dataset_id": dataset_id, "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar", "title": "Barras de población"},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }
    base.update(overrides)
    return base


def _chart_payload(dataset_id: str, **spec_overrides: Any) -> dict:
    return {
        "name": "Barras de población",
        "chart_spec": _spec(dataset_id, **spec_overrides),
    }


@pytest.fixture(autouse=True)
def _mock_infer_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return ([{"name": c, "data_type": "text"} for c in _SCHEMA_COLS], [])

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)


def _create_dataset(client: TestClient) -> str:
    conn = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    assert conn.status_code == 201, conn.text
    ds = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": conn.json()["id"]}
    )
    assert ds.status_code == 201, ds.text
    return ds.json()["id"]


def test_create_chart_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    res = client.post("/api/admin/charts", json=_chart_payload(dataset_id))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["renderer"] == "echarts"
    assert body["status"] == "draft"
    # Denormalizados sincronizados desde la spec.
    assert body["chart_type"] == "bar"
    assert body["dataset_id"] == dataset_id
    assert body["chart_spec"]["visual"]["chart_type"] == "bar"


def test_create_chart_unknown_column_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = _chart_payload(
        dataset_id,
        encodings={"x": [{"field": "inexistente"}], "y": [{"field": "poblacion"}]},
    )
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text
    assert "inexistente" in res.text


def test_create_chart_bad_type_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = _chart_payload(dataset_id, visual={"chart_type": "wormhole"})
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text


def test_create_candlestick_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Velas",
        "chart_spec": _spec(
            dataset_id,
            visual={"chart_type": "candlestick"},
            encodings={
                "x": [{"field": "fecha"}],
                "fields": {
                    "open": "open", "close": "close", "lowest": "lowest", "highest": "highest",
                },
            },
        ),
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 201, res.text


def test_create_candlestick_missing_field_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Velas incompletas",
        "chart_spec": _spec(
            dataset_id,
            visual={"chart_type": "candlestick"},
            encodings={"x": [{"field": "fecha"}], "fields": {"open": "open", "close": "close"}},
        ),
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text
    assert "lowest" in res.text and "highest" in res.text


def test_create_boxplot_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Cajas",
        "chart_spec": _spec(
            dataset_id,
            visual={"chart_type": "boxplot"},
            encodings={
                "x": [{"field": "municipio"}],
                "fields": {
                    "min": "vmin", "q1": "q1", "median": "median", "q3": "q3", "max": "vmax",
                },
            },
        ),
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 201, res.text


def test_create_kpi_and_table_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    kpi = {
        "name": "Total poblacional",
        "chart_spec": _spec(
            dataset_id,
            visual={"chart_type": "kpi"},
            encodings={"y": [{"field": "poblacion", "aggregation": "sum"}]},
        ),
    }
    assert client.post("/api/admin/charts", json=kpi).status_code == 201

    table = {
        "name": "Tabla de población",
        "chart_spec": _spec(
            dataset_id,
            visual={"chart_type": "table"},
            encodings={"x": [{"field": "municipio"}], "y": [{"field": "poblacion"}]},
        ),
    }
    assert client.post("/api/admin/charts", json=table).status_code == 201


def test_create_chart_missing_dataset_returns_404(client: TestClient) -> None:
    res = client.post("/api/admin/charts", json=_chart_payload(str(uuid.uuid4())))
    assert res.status_code == 404, res.text


def test_update_chart_rejects_unknown_column(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()
    res = client.put(
        f"/api/admin/charts/{created['id']}",
        json={
            "chart_spec": _spec(
                dataset_id,
                encodings={"x": [{"field": "otra"}], "y": [{"field": "poblacion"}]},
            )
        },
    )
    assert res.status_code == 422, res.text


def test_update_chart_syncs_denormalized_fields(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()
    res = client.put(
        f"/api/admin/charts/{created['id']}",
        json={
            "name": "Ahora líneas",
            "chart_spec": _spec(dataset_id, visual={"chart_type": "line"}),
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Ahora líneas"
    assert body["chart_type"] == "line"


def test_list_get_and_delete_chart(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()

    assert client.get(f"/api/admin/charts/{created['id']}").status_code == 200
    assert len(client.get("/api/admin/charts").json()) == 1

    assert client.delete(f"/api/admin/charts/{created['id']}").status_code == 204
    # Archivada → ya no aparece en el listado.
    assert client.get("/api/admin/charts").json() == []


def test_preview_chart(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()

    def fake_run_query(connection, sql, params, max_rows, **kwargs):  # type: ignore[no-untyped-def]
        return PreviewResult(
            columns=[ColumnMeta(name="municipio", data_type="text")],
            rows=[{"municipio": "Guadalajara"}],
            total_rows=1,
            truncated=False,
            elapsed_ms=1.0,
        )

    monkeypatch.setattr(datasets_service, "run_query", fake_run_query)

    res = client.post(f"/api/admin/charts/{created['id']}/preview")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rows"] == [{"municipio": "Guadalajara"}]
    # El preview de una gráfica guardada también expone el SQL generado.
    assert "GROUP BY" in body["generated_sql"]


# ── Gráfica de código (sandbox JS + ECharts) ──────────────────────────────────


def test_create_code_chart_ok(client: TestClient) -> None:
    """Una gráfica de código se guarda sin encodings; el `code` persiste en la spec."""
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Barras a mano",
        "chart_spec": _spec(
            dataset_id,
            encodings={"x": [], "y": []},  # sin mapeo: el código controla el render
            code="return { series: [{ type: 'bar', data: rows.map(r => r.poblacion) }] }",
        ),
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 201, res.text
    assert res.json()["chart_spec"]["code"].startswith("return")


def test_code_chart_preview_selects_raw_rows(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """El preview de una gráfica de código entrega filas crudas (SELECT *), no agregadas."""
    dataset_id = _create_dataset(client)
    created = client.post(
        "/api/admin/charts",
        json={
            "name": "Código",
            "chart_spec": _spec(
                dataset_id, encodings={"x": [], "y": []}, code="return {}"
            ),
        },
    ).json()

    captured: dict[str, str] = {}

    def fake_run_query(connection, sql, params, max_rows, **kwargs):  # type: ignore[no-untyped-def]
        captured["sql"] = sql
        return PreviewResult(
            columns=[ColumnMeta(name="municipio", data_type="text")],
            rows=[{"municipio": "Guadalajara"}],
            total_rows=1,
            truncated=False,
            elapsed_ms=1.0,
        )

    monkeypatch.setattr(datasets_service, "run_query", fake_run_query)
    res = client.post(f"/api/admin/charts/{created['id']}/preview")
    assert res.status_code == 200, res.text
    # Sin agregación: SELECT * de la subconsulta del dataset, sin GROUP BY.
    assert captured["sql"].startswith("SELECT * FROM (")
    assert "GROUP BY" not in captured["sql"]


def test_admin_endpoint_requires_tablerillos_role(client: TestClient) -> None:
    """Un usuario de Minerva sin rol en Tablerillos es rechazado por require_app_access."""
    fastapi_app.dependency_overrides[get_current_user] = lambda: CurrentUser(sub="sin-rol", roles=[])
    res = client.get("/api/admin/charts")
    assert res.status_code == 403, res.text


# ── Estados (RF-10) ───────────────────────────────────────────────────────────


def test_update_status_and_filter(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()

    res = client.put(f"/api/admin/charts/{created['id']}", json={"status": "in_review"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "in_review"

    # Filtro por estado.
    assert len(client.get("/api/admin/charts?status=in_review").json()) == 1
    assert client.get("/api/admin/charts?status=approved").json() == []

    # Estado inválido → 422 del enum.
    res = client.put(f"/api/admin/charts/{created['id']}", json={"status": "publicada"})
    assert res.status_code == 422


def test_archived_only_visible_with_filter(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post("/api/admin/charts", json=_chart_payload(dataset_id)).json()
    client.delete(f"/api/admin/charts/{created['id']}")

    assert client.get("/api/admin/charts").json() == []
    assert len(client.get("/api/admin/charts?status=archived").json()) == 1
