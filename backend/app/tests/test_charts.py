"""Tests de API del módulo charts: CRUD, validación de spec (tipo + mapeo de
campos contra las columnas del dataset), preview y el gate `require_app_access`.

`_infer_schema` y `run_query` se mockean: requieren una conexión Postgres real,
fuera de alcance para estos tests (igual que en `test_datasets_api.py`).
"""

import uuid

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

_CHART_PAYLOAD = {
    "name": "Barras de población",
    "chart_type": "bar",
    "field_mapping": {"x": "municipio", "y": "municipio"},
    "visual_config": {},
}


# Columnas que el dataset de prueba "expone" (superset para cubrir todos los tipos).
_SCHEMA_COLS = [
    "municipio", "anio", "fecha",
    "open", "close", "lowest", "highest",  # candlestick
    "vmin", "q1", "median", "q3", "vmax",  # boxplot
]


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
    res = client.post("/api/admin/charts", json={**_CHART_PAYLOAD, "dataset_id": dataset_id})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["renderer"] == "echarts"
    assert body["status"] == "draft"
    assert body["chart_type"] == "bar"


def test_create_chart_unknown_column_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        **_CHART_PAYLOAD,
        "dataset_id": dataset_id,
        "field_mapping": {"x": "inexistente", "y": "inexistente"},
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text
    assert "inexistente" in res.text


def test_create_chart_bad_type_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {**_CHART_PAYLOAD, "dataset_id": dataset_id, "chart_type": "wormhole"}
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text


def test_create_candlestick_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Velas",
        "chart_type": "candlestick",
        "dataset_id": dataset_id,
        "field_mapping": {
            "x": ["fecha"],
            "y": [],
            "fields": {"open": "open", "close": "close", "lowest": "lowest", "highest": "highest"},
        },
        "visual_config": {},
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 201, res.text


def test_create_candlestick_missing_field_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Velas incompletas",
        "chart_type": "candlestick",
        "dataset_id": dataset_id,
        "field_mapping": {"x": ["fecha"], "y": [], "fields": {"open": "open", "close": "close"}},
        "visual_config": {},
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 422, res.text
    assert "lowest" in res.text and "highest" in res.text


def test_create_boxplot_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    payload = {
        "name": "Cajas",
        "chart_type": "boxplot",
        "dataset_id": dataset_id,
        "field_mapping": {
            "x": ["municipio"],
            "y": [],
            "fields": {"min": "vmin", "q1": "q1", "median": "median", "q3": "q3", "max": "vmax"},
        },
        "visual_config": {},
    }
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 201, res.text


def test_create_chart_missing_dataset_returns_404(client: TestClient) -> None:
    payload = {**_CHART_PAYLOAD, "dataset_id": str(uuid.uuid4())}
    res = client.post("/api/admin/charts", json=payload)
    assert res.status_code == 404, res.text


def test_update_chart_rejects_unknown_column(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post(
        "/api/admin/charts", json={**_CHART_PAYLOAD, "dataset_id": dataset_id}
    ).json()
    res = client.put(
        f"/api/admin/charts/{created['id']}", json={"field_mapping": {"x": "otra"}}
    )
    assert res.status_code == 422, res.text


def test_list_get_and_delete_chart(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    created = client.post(
        "/api/admin/charts", json={**_CHART_PAYLOAD, "dataset_id": dataset_id}
    ).json()

    assert client.get(f"/api/admin/charts/{created['id']}").status_code == 200
    assert len(client.get("/api/admin/charts").json()) == 1

    assert client.delete(f"/api/admin/charts/{created['id']}").status_code == 204
    # Archivada → ya no aparece en el listado.
    assert client.get("/api/admin/charts").json() == []


def test_preview_chart(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset_id = _create_dataset(client)
    created = client.post(
        "/api/admin/charts", json={**_CHART_PAYLOAD, "dataset_id": dataset_id}
    ).json()

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
    assert res.json()["rows"] == [{"municipio": "Guadalajara"}]


def test_admin_endpoint_requires_tablerillos_role(client: TestClient) -> None:
    """Un usuario de Minerva sin rol en Tablerillos es rechazado por require_app_access."""
    fastapi_app.dependency_overrides[get_current_user] = lambda: CurrentUser(sub="sin-rol", roles=[])
    res = client.get("/api/admin/charts")
    assert res.status_code == 403, res.text
