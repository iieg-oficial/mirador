"""Tests del health check con componentes (metadata DB + Redis).

Sin Postgres/Redis reales: el engine se sustituye por uno sqlite en memoria y
get_redis por fakes que responden o fallan.
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import create_engine

from app import main as main_module
from app.core import database
from app.modules.auth import session as session_module


class _OkRedis:
    def ping(self) -> bool:
        return True


class _DownRedis:
    def ping(self) -> bool:
        raise ConnectionError("connection refused")


@pytest.fixture
def _healthy_deps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(database, "engine", create_engine("sqlite://"))
    monkeypatch.setattr(session_module, "get_redis", lambda: _OkRedis())
    monkeypatch.setattr(main_module.auth_session, "get_redis", lambda: _OkRedis())


def test_health_ok(client: TestClient, _healthy_deps: None) -> None:
    res = client.get("/health")
    assert res.status_code == 200, res.text
    assert res.json() == {"status": "ok", "components": {"database": "ok", "redis": "ok"}}


def test_health_redis_down(
    client: TestClient, _healthy_deps: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module.auth_session, "get_redis", lambda: _DownRedis())

    res = client.get("/health")
    assert res.status_code == 503, res.text
    body = res.json()
    assert body["status"] == "error"
    assert body["components"] == {"database": "ok", "redis": "error"}


def test_health_database_down(
    client: TestClient, _healthy_deps: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _BrokenEngine:
        def connect(self) -> None:
            raise ConnectionError("db down")

    monkeypatch.setattr(database, "engine", _BrokenEngine())

    res = client.get("/health")
    assert res.status_code == 503, res.text
    assert res.json()["components"]["database"] == "error"
