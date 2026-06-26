"""Tests de la abstracción de auth (modo stub).

Validan que: (1) `/api/auth/me` devuelve el usuario dev; (2) `require_permission`
concede o deniega correctamente según el header `X-Dev-Permissions`, lo que
prueba que el contrato de autorización funciona independientemente de Minerva.
"""

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.main import app
from app.modules.auth.deps import require_permission
from app.modules.auth.provider import CurrentUser

client = TestClient(app)


def test_me_returns_stub_user() -> None:
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["sub"] == "dev-local"


def _protected_client() -> TestClient:
    test_app = FastAPI()

    @test_app.get("/protected")
    def protected(
        user: CurrentUser = Depends(require_permission("tablerillos.connections.create")),
    ) -> dict[str, str]:
        return {"sub": user.sub}

    return TestClient(test_app)


def test_permission_granted_via_header() -> None:
    res = _protected_client().get(
        "/protected", headers={"X-Dev-Permissions": "tablerillos.connections.create"}
    )
    assert res.status_code == 200


def test_permission_denied_when_not_granted() -> None:
    res = _protected_client().get(
        "/protected", headers={"X-Dev-Permissions": "tablerillos.connections.view"}
    )
    assert res.status_code == 403


def test_permission_allowed_without_header_in_dev() -> None:
    res = _protected_client().get("/protected")
    assert res.status_code == 200
