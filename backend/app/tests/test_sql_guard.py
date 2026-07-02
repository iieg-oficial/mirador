"""Tests del guard de SQL: acepta SELECT seguros (incl. columnas con nombres que
antes chocaban con la blacklist) y rechaza escritura/DDL/funciones peligrosas."""

import pytest

from app.core.sql_guard import validate_sql

_VALID = [
    "SELECT 1",
    "SELECT municipio, anio FROM mart.poblacion WHERE anio = :anio",
    # `owner`, `comment`, `update` como identificadores: ya no son falsos positivos.
    "SELECT owner, comment, update_ts FROM auditoria",
    "SELECT nombre FROM t WHERE nombre LIKE '%2024%'",
    "WITH x AS (SELECT 1 AS n) SELECT n FROM x",
]

_INVALID = [
    "INSERT INTO t VALUES (1)",
    "UPDATE t SET a = 1",
    "DELETE FROM t",
    "DROP TABLE t",
    "SELECT * INTO nueva FROM t",
    "WITH x AS (INSERT INTO t VALUES (1) RETURNING id) SELECT * FROM x",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT * FROM dblink('host=x', 'SELECT 1') AS t(a int)",
    "SELECT 1; SELECT 2",
    "GRANT SELECT ON t TO u",
    "VACUUM t",
    "SET ROLE admin",
]


@pytest.mark.parametrize("sql", _VALID)
def test_accepts_safe_selects(sql: str) -> None:
    validate_sql(sql)  # no debe lanzar


@pytest.mark.parametrize("sql", _INVALID)
def test_rejects_unsafe_sql(sql: str) -> None:
    with pytest.raises(ValueError):
        validate_sql(sql)
