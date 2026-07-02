"""Tests del cache de datasets (REVISION_CODIGO.md #6 y #9).

Usa un fake mínimo de Redis (solo los métodos que cache.py invoca) en vez de
una instancia real, ya que el entorno de tests no levanta Redis.
"""

from datetime import date
from decimal import Decimal

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core import cache


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = value

    def scan_iter(self, match: str, count: int = 100):  # type: ignore[no-untyped-def]
        import fnmatch

        return iter([k for k in self.store if fnmatch.fnmatch(k, match)])

    def delete(self, *keys: str) -> None:
        for k in keys:
            self.store.pop(k, None)


class _BrokenRedis:
    def get(self, key: str) -> str | None:
        raise RedisConnectionError("no Redis available")

    def setex(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise RedisConnectionError("no Redis available")

    def scan_iter(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise RedisConnectionError("no Redis available")


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> _FakeRedis:
    fake = _FakeRedis()
    monkeypatch.setattr(cache, "get_redis", lambda: fake)
    return fake


def test_set_then_get_round_trip(fake_redis: _FakeRedis) -> None:
    data = {"rows": [{"a": "2024-01-01", "b": "12.50"}]}
    cache.set_cached("ds1", {"p": 1}, data, ttl_seconds=60)
    assert cache.get_cached("ds1", {"p": 1}) == data


def test_get_cached_miss_returns_none(fake_redis: _FakeRedis) -> None:
    assert cache.get_cached("ds1", {}) is None


def test_set_cached_noop_when_ttl_zero(fake_redis: _FakeRedis) -> None:
    cache.set_cached("ds1", {}, {"rows": []}, ttl_seconds=0)
    assert fake_redis.store == {}


def test_different_params_do_not_collide(fake_redis: _FakeRedis) -> None:
    cache.set_cached("ds1", {"p": 1}, {"v": 1}, ttl_seconds=60)
    cache.set_cached("ds1", {"p": 2}, {"v": 2}, ttl_seconds=60)
    assert cache.get_cached("ds1", {"p": 1}) == {"v": 1}
    assert cache.get_cached("ds1", {"p": 2}) == {"v": 2}


def test_invalidate_removes_only_matching_dataset(fake_redis: _FakeRedis) -> None:
    cache.set_cached("ds1", {"p": 1}, {"v": 1}, ttl_seconds=60)
    cache.set_cached("ds2", {"p": 1}, {"v": 2}, ttl_seconds=60)
    cache.invalidate("ds1")
    assert cache.get_cached("ds1", {"p": 1}) is None
    assert cache.get_cached("ds2", {"p": 1}) == {"v": 2}


def test_redis_unavailable_degrades_gracefully(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cache, "get_redis", lambda: _BrokenRedis())
    assert cache.get_cached("ds1", {}) is None
    cache.set_cached("ds1", {}, {"v": 1}, ttl_seconds=60)  # no debe lanzar
    cache.invalidate("ds1")  # no debe lanzar


def test_json_dumps_of_jsonable_data_is_round_trippable(fake_redis: _FakeRedis) -> None:
    """set_cached ya no usa default=str: si llega algo no serializable es un
    bug real que debe propagarse, no quedar enmascarado como warning."""
    data = {"rows": [{"a": date(2024, 1, 1).isoformat(), "b": str(Decimal("12.50"))}]}
    cache.set_cached("ds1", {}, data, ttl_seconds=60)
    assert cache.get_cached("ds1", {}) == data


def test_set_cached_propagates_non_redis_errors(fake_redis: _FakeRedis) -> None:
    with pytest.raises(TypeError):
        cache.set_cached("ds1", {}, {"bad": date(2024, 1, 1)}, ttl_seconds=60)
