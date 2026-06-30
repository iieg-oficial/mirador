"""Tests de run_query: serialización consistente cache hit/miss (#6) y
COUNT(*) evitado cuando no hubo truncamiento (#7).

psycopg.connect se reemplaza por un fake mínimo — no hay BD Postgres real
disponible en el entorno de tests.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.modules.connections.models import Connection, ConnectionEngine
from app.modules.datasets import service as datasets_service


class _FakeColumnDescription:
    def __init__(self, name: str) -> None:
        self.name = name
        self.type_display = None
        self.type_code = 25


class _FakeCursor:
    def __init__(self, rows: list[tuple], description: list[_FakeColumnDescription]) -> None:
        self._rows = rows
        self.description = description
        self.executed: list[str] = []

    def execute(self, sql: str, params: dict | None = None) -> None:
        self.executed.append(sql)

    def fetchall(self) -> list[tuple]:
        return self._rows

    def fetchone(self) -> tuple:
        return (len(self._rows),)

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, *exc: object) -> None:
        return None


class _FakeConn:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor
        self.read_only = False

    def cursor(self) -> _FakeCursor:
        return self._cursor

    def __enter__(self) -> "_FakeConn":
        return self

    def __exit__(self, *exc: object) -> None:
        return None


@pytest.fixture
def fake_connection() -> Connection:
    return Connection(
        id=uuid.uuid4(),
        name="t",
        engine=ConnectionEngine.postgresql,
        host="h",
        port=5432,
        database="d",
        username="u",
        encrypted_password="irrelevant",
    )


def _patch_connect(monkeypatch: pytest.MonkeyPatch, cursor: _FakeCursor) -> None:
    monkeypatch.setattr(datasets_service.psycopg, "connect", lambda *a, **k: _FakeConn(cursor))
    monkeypatch.setattr(datasets_service, "_make_conninfo", lambda c: "fake")


def test_cache_hit_and_miss_have_identical_shape(
    monkeypatch: pytest.MonkeyPatch, fake_connection: Connection
) -> None:
    description = [_FakeColumnDescription("d"), _FakeColumnDescription("amt")]
    cursor = _FakeCursor([(date(2024, 1, 1), Decimal("12.50"))], description)
    _patch_connect(monkeypatch, cursor)

    store: dict[str, dict] = {}
    monkeypatch.setattr(datasets_service, "get_cached", lambda ds_id, params: store.get(ds_id))
    monkeypatch.setattr(
        datasets_service, "set_cached", lambda ds_id, params, data, ttl: store.__setitem__(ds_id, data)
    )

    miss = datasets_service.run_query(
        fake_connection, "SELECT d, amt FROM t", {}, max_rows=10, dataset_id="ds1", cache_ttl_seconds=60
    )
    hit = datasets_service.run_query(
        fake_connection, "SELECT d, amt FROM t", {}, max_rows=10, dataset_id="ds1", cache_ttl_seconds=60
    )

    assert miss.model_dump() == hit.model_dump()
    # Tipos JSON-safe en ambos casos (no datetime.date/Decimal "crudos").
    assert isinstance(miss.rows[0]["d"], str)
    assert isinstance(miss.rows[0]["amt"], str)


def test_count_skipped_when_not_truncated(
    monkeypatch: pytest.MonkeyPatch, fake_connection: Connection
) -> None:
    description = [_FakeColumnDescription("x")]
    cursor = _FakeCursor([(1,), (2,)], description)  # 2 filas, max_rows=10 → sin truncar
    _patch_connect(monkeypatch, cursor)

    result = datasets_service.run_query(fake_connection, "SELECT x FROM t", {}, max_rows=10)

    assert result.truncated is False
    assert result.total_rows == 2
    assert not any("COUNT(*)" in sql for sql in cursor.executed)


def test_count_executed_when_truncated(
    monkeypatch: pytest.MonkeyPatch, fake_connection: Connection
) -> None:
    description = [_FakeColumnDescription("x")]
    # max_rows=1 con 2 filas devueltas (max_rows + 1) → truncado.
    cursor = _FakeCursor([(1,), (2,)], description)
    _patch_connect(monkeypatch, cursor)

    result = datasets_service.run_query(fake_connection, "SELECT x FROM t", {}, max_rows=1)

    assert result.truncated is True
    assert any("COUNT(*)" in sql for sql in cursor.executed)
