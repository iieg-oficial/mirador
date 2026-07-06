"""Tests de API del módulo dashboards: CRUD del tablero y reemplazo en bloque
del layout de items (RF-13/RF-14).

`_infer_schema` se mockea igual que en `test_charts.py`: requiere una conexión
Postgres real, fuera de alcance para estos tests.
"""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modules.datasets import service as datasets_service

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

_SCHEMA_COLS = ["municipio", "anio", "poblacion"]


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


@pytest.fixture(autouse=True)
def _mock_infer_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return ([{"name": c, "data_type": "text"} for c in _SCHEMA_COLS], [])

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)


def _create_chart(client: TestClient) -> str:
    conn = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    assert conn.status_code == 201, conn.text
    ds = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": conn.json()["id"]}
    )
    assert ds.status_code == 201, ds.text
    dataset_id = ds.json()["id"]
    chart = client.post(
        "/api/admin/charts",
        json={"name": "Barras de población", "chart_spec": _spec(dataset_id)},
    )
    assert chart.status_code == 201, chart.text
    return chart.json()["id"]


def _create_dashboard(client: TestClient, **overrides: Any) -> dict:
    payload = {"name": "Panorama municipal", "description": "Indicadores clave"}
    payload.update(overrides)
    res = client.post("/api/admin/dashboards", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_create_and_list_dashboard(client: TestClient) -> None:
    created = _create_dashboard(client)
    assert created["status"] == "draft"
    assert created["global_filters"] == []

    listed = client.get("/api/admin/dashboards")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_get_dashboard_includes_items(client: TestClient) -> None:
    created = _create_dashboard(client)
    res = client.get(f"/api/admin/dashboards/{created['id']}")
    assert res.status_code == 200, res.text
    assert res.json()["items"] == []


def test_update_dashboard(client: TestClient) -> None:
    created = _create_dashboard(client)
    filtro = {
        "id": "anio",
        "label": "Año",
        "control_type": "select",
        "options": [{"value": 2026, "label": "2026"}],
        "default_value": 2026,
        "targets": [],
    }
    res = client.put(
        f"/api/admin/dashboards/{created['id']}",
        json={"name": "Panorama estatal", "global_filters": [filtro]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Panorama estatal"
    assert body["global_filters"][0]["id"] == "anio"
    assert body["global_filters"][0]["control_type"] == "select"
    # description no incluida en el patch (exclude_unset) → conserva la original.
    assert body["description"] == "Indicadores clave"


def test_update_dashboard_rejects_invalid_filter(client: TestClient) -> None:
    created = _create_dashboard(client)
    # control_type fuera del enum → 422.
    res = client.put(
        f"/api/admin/dashboards/{created['id']}",
        json={"global_filters": [{"id": "x", "label": "X", "control_type": "slider"}]},
    )
    assert res.status_code == 422, res.text


def test_archive_dashboard(client: TestClient) -> None:
    created = _create_dashboard(client)
    res = client.delete(f"/api/admin/dashboards/{created['id']}")
    assert res.status_code == 204, res.text
    # Archivado → ya no aparece en el listado.
    assert client.get("/api/admin/dashboards").json() == []
    # Pero sigue accesible por id.
    assert client.get(f"/api/admin/dashboards/{created['id']}").json()["status"] == "archived"


def test_replace_items_with_valid_chart(client: TestClient) -> None:
    chart_id = _create_chart(client)
    dashboard = _create_dashboard(client)

    res = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "chart_id": chart_id,
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 2},
                    "local_config": {"filters": [], "variable_key": "poblacion_total"},
                }
            ]
        },
    )
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) == 1
    assert items[0]["chart_id"] == chart_id
    assert items[0]["local_config"]["variable_key"] == "poblacion_total"


def test_replace_items_markdown_without_chart_id(client: TestClient) -> None:
    dashboard = _create_dashboard(client)
    res = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "item_type": "markdown",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 1},
                    "local_config": {"content": "# Sección"},
                }
            ]
        },
    )
    assert res.status_code == 200, res.text
    items = res.json()
    assert items[0]["chart_id"] is None
    assert items[0]["item_type"] == "markdown"


def test_replace_items_missing_chart_id_returns_422(client: TestClient) -> None:
    dashboard = _create_dashboard(client)
    res = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 2},
                }
            ]
        },
    )
    assert res.status_code == 422, res.text


def test_replace_items_unknown_chart_returns_422(client: TestClient) -> None:
    dashboard = _create_dashboard(client)
    res = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "chart_id": str(uuid.uuid4()),
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 2},
                }
            ]
        },
    )
    assert res.status_code == 422, res.text


def test_replace_items_archived_chart_returns_422(client: TestClient) -> None:
    chart_id = _create_chart(client)
    assert client.delete(f"/api/admin/charts/{chart_id}").status_code == 204

    dashboard = _create_dashboard(client)
    res = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "chart_id": chart_id,
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 2},
                }
            ]
        },
    )
    assert res.status_code == 422, res.text


def test_replace_items_fully_replaces_previous_layout(client: TestClient) -> None:
    chart_id = _create_chart(client)
    dashboard = _create_dashboard(client)

    first = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "chart_id": chart_id,
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 2},
                },
                {
                    "item_type": "markdown",
                    "position_config": {"x": 4, "y": 0, "w": 4, "h": 1},
                    "local_config": {"content": "Nota"},
                },
            ]
        },
    )
    assert first.status_code == 200, first.text
    assert len(first.json()) == 2

    second = client.put(
        f"/api/admin/dashboards/{dashboard['id']}/items",
        json={
            "items": [
                {
                    "item_type": "markdown",
                    "position_config": {"x": 0, "y": 0, "w": 12, "h": 1},
                    "local_config": {"content": "Reemplazo total"},
                }
            ]
        },
    )
    assert second.status_code == 200, second.text
    items = second.json()
    assert len(items) == 1
    assert items[0]["local_config"]["content"] == "Reemplazo total"

    detail = client.get(f"/api/admin/dashboards/{dashboard['id']}")
    assert len(detail.json()["items"]) == 1
