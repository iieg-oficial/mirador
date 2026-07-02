"""Tests de API del módulo dashboards: CRUD, layout en bloque y filtros globales."""

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
    "slug": "poblacion_municipal_dash",
    "sql_query": "SELECT municipio, poblacion FROM mart.poblacion",
    "max_rows": 1000,
    "cache_ttl_seconds": 300,
}


@pytest.fixture(autouse=True)
def _mock_infer_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return (
            [
                {"name": "municipio", "data_type": "text"},
                {"name": "poblacion", "data_type": "int8"},
            ],
            [],
        )

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)


def _spec(dataset_id: str) -> dict[str, Any]:
    return {
        "version": "1.0",
        "data": {"dataset_id": dataset_id, "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar"},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }


def _create_chart(client: TestClient) -> str:
    conn = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    ds = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": conn.json()["id"]}
    )
    chart = client.post(
        "/api/admin/charts", json={"name": "Barras", "chart_spec": _spec(ds.json()["id"])}
    )
    assert chart.status_code == 201, chart.text
    return chart.json()["id"]


def test_dashboard_crud(client: TestClient) -> None:
    res = client.post(
        "/api/admin/dashboards", json={"name": "Tablero demo", "description": "Exploratorio"}
    )
    assert res.status_code == 201, res.text
    dash = res.json()
    assert dash["status"] == "draft"
    assert dash["global_filters"] == []

    assert len(client.get("/api/admin/dashboards").json()) == 1

    res = client.put(f"/api/admin/dashboards/{dash['id']}", json={"name": "Tablero v2"})
    assert res.json()["name"] == "Tablero v2"

    assert client.delete(f"/api/admin/dashboards/{dash['id']}").status_code == 204
    assert client.get("/api/admin/dashboards").json() == []


def test_replace_items_and_detail(client: TestClient) -> None:
    chart_id = _create_chart(client)
    dash = client.post("/api/admin/dashboards", json={"name": "Tablero"}).json()

    items = [
        {
            "chart_id": chart_id,
            "item_type": "chart",
            "position_config": {"x": 0, "y": 0, "w": 6, "h": 4},
            "local_config": {"filters": [{"field": "municipio", "operator": "=", "value": "Zapopan"}]},
        },
        {
            "item_type": "text",
            "position_config": {"x": 6, "y": 0, "w": 6, "h": 2},
            "local_config": {"content": "Notas del análisis"},
        },
    ]
    res = client.put(f"/api/admin/dashboards/{dash['id']}/items", json={"items": items})
    assert res.status_code == 200, res.text
    assert len(res.json()) == 2

    detail = client.get(f"/api/admin/dashboards/{dash['id']}").json()
    assert len(detail["items"]) == 2
    by_type = {i["item_type"]: i for i in detail["items"]}
    assert by_type["chart"]["chart_id"] == chart_id
    assert by_type["chart"]["position_config"] == {"x": 0, "y": 0, "w": 6, "h": 4}
    assert by_type["text"]["local_config"]["content"] == "Notas del análisis"

    # Reemplazo en bloque: un layout nuevo sustituye al anterior.
    res = client.put(
        f"/api/admin/dashboards/{dash['id']}/items",
        json={"items": [items[0]]},
    )
    assert res.status_code == 200
    assert len(client.get(f"/api/admin/dashboards/{dash['id']}").json()["items"]) == 1


def test_replace_items_rejects_missing_or_archived_chart(client: TestClient) -> None:
    import uuid

    chart_id = _create_chart(client)
    dash = client.post("/api/admin/dashboards", json={"name": "Tablero"}).json()

    bogus = {
        "chart_id": str(uuid.uuid4()),
        "item_type": "chart",
        "position_config": {"x": 0, "y": 0, "w": 4, "h": 3},
    }
    res = client.put(f"/api/admin/dashboards/{dash['id']}/items", json={"items": [bogus]})
    assert res.status_code == 422

    # Gráfica archivada tampoco se acepta.
    client.delete(f"/api/admin/charts/{chart_id}")
    res = client.put(
        f"/api/admin/dashboards/{dash['id']}/items",
        json={
            "items": [
                {
                    "chart_id": chart_id,
                    "item_type": "chart",
                    "position_config": {"x": 0, "y": 0, "w": 4, "h": 3},
                }
            ]
        },
    )
    assert res.status_code == 422

    # Item chart sin chart_id.
    res = client.put(
        f"/api/admin/dashboards/{dash['id']}/items",
        json={"items": [{"item_type": "chart", "position_config": {"x": 0, "y": 0, "w": 4, "h": 3}}]},
    )
    assert res.status_code == 422


def test_global_filters_validated(client: TestClient) -> None:
    dash = client.post("/api/admin/dashboards", json={"name": "Tablero"}).json()

    res = client.put(
        f"/api/admin/dashboards/{dash['id']}",
        json={"global_filters": [{"field": "anio", "operator": "=", "value": 2025}]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["global_filters"] == [{"field": "anio", "operator": "=", "value": 2025}]

    # Operador inválido → 422 (usa el mismo FilterSpec que la ChartSpec).
    res = client.put(
        f"/api/admin/dashboards/{dash['id']}",
        json={"global_filters": [{"field": "anio", "operator": "LIKE", "value": "x"}]},
    )
    assert res.status_code == 422
