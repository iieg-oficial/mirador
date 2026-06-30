"""Tests unitarios de helpers del módulo datasets (sin BD externa).

Cubren la traducción de parámetros nombrados `:name → %(name)s`, que debe
ignorar los casts de PostgreSQL (`::tipo`) — ver REVISION_CODIGO.md #1.
"""

import pytest

from app.core.sql_guard import normalize_sql, validate_sql
from app.modules.datasets.service import _extract_named_params, _named_to_psycopg


def test_named_param_simple() -> None:
    assert _named_to_psycopg("SELECT * FROM t WHERE id = :id") == (
        "SELECT * FROM t WHERE id = %(id)s"
    )
    assert _extract_named_params("SELECT * FROM t WHERE id = :id") == ["id"]


def test_named_param_ignores_postgres_cast() -> None:
    sql = "SELECT fecha::date, monto::numeric FROM ventas"
    assert _named_to_psycopg(sql) == sql
    assert _extract_named_params(sql) == []


def test_named_param_ignores_chained_cast() -> None:
    sql = "SELECT monto::numeric::text FROM ventas WHERE id = :id"
    assert _named_to_psycopg(sql) == "SELECT monto::numeric::text FROM ventas WHERE id = %(id)s"
    assert _extract_named_params(sql) == ["id"]


def test_named_param_immediately_followed_by_cast() -> None:
    sql = "SELECT :age::int"
    assert _named_to_psycopg(sql) == "SELECT %(age)s::int"
    assert _extract_named_params(sql) == ["age"]


def test_named_param_repeated_only_extracted_once() -> None:
    sql = "SELECT * FROM t WHERE a = :id OR b = :id"
    assert _extract_named_params(sql) == ["id"]


def test_named_param_inside_string_literal_known_limitation() -> None:
    """Limitación conocida (REVISION_CODIGO.md #1): no se distingue un ':' dentro
    de un literal de cadena de un parámetro real. Documentado, no se tokeniza SQL."""
    sql = "SELECT * FROM t WHERE x = '12:hora'"
    assert _named_to_psycopg(sql) == "SELECT * FROM t WHERE x = '12%(hora)s'"


# ── normalize_sql / ';' final (REVISION_CODIGO.md #4) ──────────────────────────


def test_normalize_sql_strips_trailing_semicolon() -> None:
    assert normalize_sql("SELECT 1;") == "SELECT 1"
    assert normalize_sql("SELECT 1 ;  ") == "SELECT 1"
    assert normalize_sql("SELECT 1;;") == "SELECT 1"


def test_normalize_sql_noop_without_trailing_semicolon() -> None:
    assert normalize_sql("SELECT 1") == "SELECT 1"


def test_validate_sql_accepts_trailing_semicolon() -> None:
    validate_sql("SELECT 1;")  # no debe lanzar


def test_validate_sql_still_rejects_multiple_statements() -> None:
    with pytest.raises(ValueError):
        validate_sql("SELECT 1; SELECT 2;")
