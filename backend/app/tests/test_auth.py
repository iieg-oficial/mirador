"""Tests de las dependencias de auth.

La auth real es Minerva; aquí se prueban los gates en aislamiento, sin tocar el
IdP ni el SDK: `require_app_access` (puerta de acceso por rol) y `require_permission`
(delegación al control de permisos). El endpoint `/api/auth/me` se prueba con la
identidad inyectada por el override de `conftest`.
"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.modules.auth import minerva
from app.modules.auth.deps import require_app_access, require_permission
from app.modules.auth.models import CurrentUser


async def test_app_access_granted_with_role() -> None:
    user = CurrentUser(sub="u", roles=["tester"])
    assert await require_app_access(user=user) is user


async def test_app_access_denied_without_role() -> None:
    with pytest.raises(HTTPException) as exc:
        await require_app_access(user=CurrentUser(sub="u", roles=[]))
    assert exc.value.status_code == 403


async def test_require_permission_delegates_to_minerva(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, str] = {}

    async def fake_assert(request, user, permission):  # type: ignore[no-untyped-def]
        seen["permission"] = permission

    monkeypatch.setattr(minerva, "assert_permission", fake_assert)

    dependency = require_permission("tablerillos.connections.create")
    user = CurrentUser(sub="u", roles=["tester"])
    result = await dependency(request=None, user=user)  # type: ignore[arg-type]

    assert result is user
    assert seen["permission"] == "tablerillos.connections.create"


def test_me_returns_injected_identity(client: TestClient) -> None:
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    body = res.json()
    assert body["sub"] == "test-user"
    assert body["roles"] == ["tester"]
