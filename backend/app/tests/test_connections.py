"""Tests del módulo de conexiones (Bloque C).

Cubren el CRUD vía API y las dos garantías de seguridad de §9.1: la contraseña
se guarda cifrada y nunca se expone al frontend.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import decrypt_secret
from app.modules.connections.models import Connection, ConnectionStatus

_PAYLOAD = {
    "name": "DW Municipal",
    "description": "Almacén de indicadores",
    "engine": "postgresql",
    "host": "db.interno",
    "port": 5432,
    "database": "indicadores",
    "username": "lector",
    "password": "s3creto-real",
    "ssl_enabled": False,
    "read_only": True,
}


def _create(client: TestClient) -> dict:
    res = client.post("/api/admin/connections", json=_PAYLOAD)
    assert res.status_code == 201, res.text
    return res.json()


def test_create_does_not_leak_secret(client: TestClient) -> None:
    body = _create(client)
    assert body["name"] == "DW Municipal"
    assert body["status"] == ConnectionStatus.inactiva.value
    # La respuesta jamás debe contener la contraseña ni su versión cifrada.
    assert "password" not in body
    assert "encrypted_password" not in body


def test_password_is_stored_encrypted(client: TestClient, session: Session) -> None:
    body = _create(client)
    connection = session.exec(select(Connection)).one()
    assert str(connection.id) == body["id"]
    # No se guarda en claro, pero sí es descifrable al valor original.
    assert connection.encrypted_password != _PAYLOAD["password"]
    assert decrypt_secret(connection.encrypted_password) == _PAYLOAD["password"]


def test_list_and_get(client: TestClient) -> None:
    created = _create(client)
    listed = client.get("/api/admin/connections")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    one = client.get(f"/api/admin/connections/{created['id']}")
    assert one.status_code == 200
    assert one.json()["id"] == created["id"]


def test_get_missing_returns_404(client: TestClient) -> None:
    res = client.get("/api/admin/connections/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


def test_update_rotates_password(client: TestClient, session: Session) -> None:
    created = _create(client)
    res = client.put(
        f"/api/admin/connections/{created['id']}",
        json={"name": "DW Renombrado", "password": "nueva-clave"},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "DW Renombrado"

    connection = session.exec(select(Connection)).one()
    assert decrypt_secret(connection.encrypted_password) == "nueva-clave"


def test_delete_archives(client: TestClient, session: Session) -> None:
    created = _create(client)
    res = client.delete(f"/api/admin/connections/{created['id']}")
    assert res.status_code == 204
    # Baja lógica: la fila sigue, pero archivada.
    connection = session.exec(select(Connection)).one()
    assert connection.status == ConnectionStatus.archivada


def test_test_endpoint_unsupported_engine(client: TestClient) -> None:
    payload = {**_PAYLOAD, "engine": "duckdb"}
    created = client.post("/api/admin/connections", json=payload).json()
    res = client.post(f"/api/admin/connections/{created['id']}/test")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert "no soportada" in (body["detail"] or "").lower()
