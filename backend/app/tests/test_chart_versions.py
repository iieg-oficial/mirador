"""Tests del versionado de gráficas (RF-12): snapshot en update, historial
ordenado y restauración (que también snapshotea el estado vigente)."""

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
    "slug": "poblacion_municipal_versiones",
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


def _spec(dataset_id: str, title: str = "v1") -> dict[str, Any]:
    return {
        "version": "1.0",
        "data": {"dataset_id": dataset_id, "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar", "title": title},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }


def _create_chart(client: TestClient) -> tuple[str, str]:
    conn = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    ds = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": conn.json()["id"]}
    )
    dataset_id = ds.json()["id"]
    chart = client.post(
        "/api/admin/charts",
        json={"name": "Barras", "chart_spec": _spec(dataset_id)},
    )
    assert chart.status_code == 201, chart.text
    return chart.json()["id"], dataset_id


def test_update_spec_creates_version_with_previous_spec(client: TestClient) -> None:
    chart_id, dataset_id = _create_chart(client)

    res = client.put(
        f"/api/admin/charts/{chart_id}",
        json={"chart_spec": _spec(dataset_id, title="v2"), "change_comment": "Cambio de título"},
    )
    assert res.status_code == 200, res.text

    versions = client.get(f"/api/admin/charts/{chart_id}/versions").json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1
    # La versión conserva el spec ANTERIOR y el comentario del cambio.
    assert versions[0]["chart_spec"]["visual"]["title"] == "v1"
    assert versions[0]["change_comment"] == "Cambio de título"


def test_update_without_spec_change_does_not_version(client: TestClient) -> None:
    chart_id, dataset_id = _create_chart(client)

    # Mismo spec → sin versión nueva; solo cambia el nombre.
    res = client.put(
        f"/api/admin/charts/{chart_id}",
        json={"name": "Renombrada", "chart_spec": _spec(dataset_id)},
    )
    assert res.status_code == 200, res.text
    assert client.get(f"/api/admin/charts/{chart_id}/versions").json() == []


def test_versions_ordered_desc(client: TestClient) -> None:
    chart_id, dataset_id = _create_chart(client)
    for title in ("v2", "v3", "v4"):
        client.put(f"/api/admin/charts/{chart_id}", json={"chart_spec": _spec(dataset_id, title)})

    versions = client.get(f"/api/admin/charts/{chart_id}/versions").json()
    assert [v["version_number"] for v in versions] == [3, 2, 1]


def test_restore_version(client: TestClient) -> None:
    chart_id, dataset_id = _create_chart(client)
    client.put(f"/api/admin/charts/{chart_id}", json={"chart_spec": _spec(dataset_id, "v2")})

    versions = client.get(f"/api/admin/charts/{chart_id}/versions").json()
    v1 = versions[0]  # spec "v1"

    res = client.post(f"/api/admin/charts/{chart_id}/restore/{v1['id']}")
    assert res.status_code == 200, res.text
    assert res.json()["chart_spec"]["visual"]["title"] == "v1"

    # La restauración snapshotea el estado que había antes ("v2").
    versions = client.get(f"/api/admin/charts/{chart_id}/versions").json()
    assert len(versions) == 2
    assert versions[0]["chart_spec"]["visual"]["title"] == "v2"
    assert "restaurar" in versions[0]["change_comment"]


def test_restore_version_of_other_chart_is_404(client: TestClient) -> None:
    chart_id, dataset_id = _create_chart(client)
    client.put(f"/api/admin/charts/{chart_id}", json={"chart_spec": _spec(dataset_id, "v2")})
    version_id = client.get(f"/api/admin/charts/{chart_id}/versions").json()[0]["id"]

    other = client.post(
        "/api/admin/charts",
        json={"name": "Otra", "chart_spec": _spec(dataset_id)},
    ).json()
    res = client.post(f"/api/admin/charts/{other['id']}/restore/{version_id}")
    assert res.status_code == 404
