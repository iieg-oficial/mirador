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


def test_load_session_without_cookie_raises_401() -> None:
    class _Req:
        cookies: dict[str, str] = {}

    with pytest.raises(HTTPException) as exc:
        minerva._load_session(_Req())  # type: ignore[arg-type]
    assert exc.value.status_code == 401


async def test_refresh_tokens_posts_refresh_grant(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings
    from app.modules.auth import oidc

    captured: dict = {}

    class _Resp:
        def raise_for_status(self) -> None: ...

        def json(self) -> dict:
            return {"access_token": "new-a", "refresh_token": "new-r"}

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *a: object) -> bool:
            return False

        async def post(self, url: str, data: dict, timeout: float) -> "_Resp":
            captured.update(url=url, data=data)
            return _Resp()

    monkeypatch.setattr(oidc.httpx, "AsyncClient", lambda: _Client())
    tokens = await oidc.refresh_tokens(get_settings(), "old-r")

    assert tokens["access_token"] == "new-a"
    assert captured["url"].endswith("/auth/token")
    assert captured["data"]["grant_type"] == "refresh_token"
    assert captured["data"]["refresh_token"] == "old-r"


async def test_refresh_and_retry_rotates_and_persists(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.auth import oidc

    async def fake_refresh(settings, rt):  # type: ignore[no-untyped-def]
        assert rt == "old-r"
        return {"access_token": "new-a", "refresh_token": "new-r"}

    async def fake_claims(token):  # type: ignore[no-untyped-def]
        assert token == "new-a"
        return {"sub": "u", "roles": ["tester"]}

    saved: dict = {}
    monkeypatch.setattr(oidc, "refresh_tokens", fake_refresh)
    monkeypatch.setattr(minerva, "_claims_from_token", fake_claims)
    monkeypatch.setattr(
        minerva._sessions, "set", lambda key, data, ttl: saved.update(key=key, data=data)
    )

    session = {"access_token": "old-a", "refresh_token": "old-r"}
    claims = await minerva._refresh_and_retry("sid1", session)

    assert claims["sub"] == "u"
    assert saved["key"] == "session:sid1"
    assert saved["data"]["refresh_token"] == "new-r"  # rotado (single-use)
