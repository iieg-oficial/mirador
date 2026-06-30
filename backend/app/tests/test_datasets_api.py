"""Tests de API del módulo datasets: validación re-cableada (#3), IntegrityError
de slug duplicado (#5) y normalización de ';' final (#4).

`_infer_schema` se mockea: requiere una conexión real a Postgres, fuera de
alcance para estos tests (sin BD externa disponible).
"""

import pytest
from fastapi.testclient import TestClient

from app.modules.datasets import service as datasets_service

_CONNECTION_PAYLOAD = {
    "name": "DW Test",
    "description": "Conexión de prueba",
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
    "description": "Población por municipio y año",
    "sql_query": "SELECT municipio, anio::int FROM mart.poblacion WHERE anio = :anio;",
    "max_rows": 1000,
    "cache_ttl_seconds": 300,
}


@pytest.fixture(autouse=True)
def _mock_infer_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    """Evita conectar a una BD Postgres real durante create/update/validate."""

    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return ([{"name": "municipio", "data_type": "text"}], ["anio"])

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)


def _create_connection(client: TestClient) -> str:
    res = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_create_dataset_auto_validates(client: TestClient) -> None:
    connection_id = _create_connection(client)
    res = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": connection_id}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "validated"
    assert body["columns_schema"] == {"columns": [{"name": "municipio", "data_type": "text"}]}
    assert body["parameters_schema"] == {"params": [{"name": "anio"}]}
    # ';' final normalizado al guardar.
    assert not body["sql_query"].rstrip().endswith(";")


def test_create_dataset_duplicate_slug_returns_409(client: TestClient) -> None:
    connection_id = _create_connection(client)
    payload = {**_DATASET_PAYLOAD, "connection_id": connection_id}
    first = client.post("/api/admin/datasets", json=payload)
    assert first.status_code == 201, first.text

    second = client.post("/api/admin/datasets", json=payload)
    assert second.status_code == 409, second.text


def test_update_dataset_sql_query_revalidates(client: TestClient) -> None:
    connection_id = _create_connection(client)
    created = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": connection_id}
    ).json()

    res = client.put(
        f"/api/admin/datasets/{created['id']}",
        json={"sql_query": "SELECT municipio FROM mart.poblacion;"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "validated"
    assert body["sql_query"] == "SELECT municipio FROM mart.poblacion"


def test_archived_dataset_releases_slug(client: TestClient) -> None:
    connection_id = _create_connection(client)
    payload = {**_DATASET_PAYLOAD, "connection_id": connection_id}
    first = client.post("/api/admin/datasets", json=payload)
    assert first.status_code == 201, first.text

    deleted = client.delete(f"/api/admin/datasets/{first.json()['id']}")
    assert deleted.status_code == 204, deleted.text

    second = client.post("/api/admin/datasets", json=payload)
    assert second.status_code == 201, second.text


def test_update_dataset_ignores_connection_id_and_slug(client: TestClient) -> None:
    """DatasetUpdate no acepta connection_id/slug: enviarlos no debe tener efecto."""
    connection_id = _create_connection(client)
    created = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": connection_id}
    ).json()

    res = client.put(
        f"/api/admin/datasets/{created['id']}",
        json={"slug": "otro_slug"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["slug"] == _DATASET_PAYLOAD["slug"]
