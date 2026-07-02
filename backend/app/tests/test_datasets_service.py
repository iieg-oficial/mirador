"""Tests unitarios de helpers del módulo datasets (sin BD externa).

Cubren la traducción de parámetros nombrados `:name → %(name)s`, que debe
ignorar los casts de PostgreSQL (`::tipo`) — ver REVISION_CODIGO.md #1.
"""

import pytest

from app.core.sql_guard import normalize_sql, validate_sql
from app.modules.datasets.service import (
    _extract_named_params,
    _named_to_psycopg,
    infer_semantics,
    merge_manual_columns,
)


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


# ── Metadata semántica de columnas ────────────────────────────────────────────


def test_infer_semantics_numeric_is_metric() -> None:
    meta = infer_semantics("poblacion_total", "int8")
    assert meta["semantic_type"] == "metrica"
    assert meta["is_metric"] is True
    assert meta["is_dimension"] is False
    assert "sum" in meta["aggregations"]
    assert meta["label"] == "Poblacion total"


def test_infer_semantics_text_is_categorical() -> None:
    meta = infer_semantics("municipio", "text")
    assert meta["semantic_type"] == "categorica"
    assert meta["is_dimension"] is True
    assert meta["aggregations"] == ["count", "count_distinct"]


def test_infer_semantics_temporal_and_bool() -> None:
    assert infer_semantics("fecha", "date")["semantic_type"] == "temporal"
    assert infer_semantics("creado", "timestamptz")["semantic_type"] == "temporal"
    assert infer_semantics("activo", "bool")["semantic_type"] == "booleano"


def test_infer_semantics_identifier_by_name() -> None:
    # Numérico pero identificador por nombre: no es métrica.
    for name in ("id", "municipio_id", "cve_mun", "clave_region"):
        meta = infer_semantics(name, "int4")
        assert meta["semantic_type"] == "identificador", name
        assert meta["is_metric"] is False


def test_infer_semantics_geometry() -> None:
    meta = infer_semantics("geom", "geometry")
    assert meta["semantic_type"] == "geografica"
    assert meta["is_dimension"] is False
    assert meta["aggregations"] == []


def test_merge_manual_columns_overrides_semantics_keeps_type() -> None:
    current = {
        "columns": [
            {"name": "municipio", "data_type": "text", "semantic_type": "categorica"},
            {"name": "poblacion", "data_type": "int8", "semantic_type": "metrica"},
        ]
    }
    manual = {
        "columns": [
            {
                "name": "municipio",
                "data_type": "varchar",  # intento de cambiar el tipo físico: se ignora
                "semantic_type": "texto",
                "label": "Municipio",
            }
        ]
    }
    merged = merge_manual_columns(current, manual)
    by_name = {c["name"]: c for c in merged["columns"]}
    assert by_name["municipio"]["semantic_type"] == "texto"
    assert by_name["municipio"]["data_type"] == "text"  # tipo físico intacto
    # La columna no incluida conserva su metadata.
    assert by_name["poblacion"]["semantic_type"] == "metrica"
    assert [c["name"] for c in merged["columns"]] == ["municipio", "poblacion"]


def test_merge_manual_columns_rejects_unknown_column() -> None:
    current = {"columns": [{"name": "a", "data_type": "text"}]}
    with pytest.raises(ValueError, match="inexistentes"):
        merge_manual_columns(current, {"columns": [{"name": "zzz", "data_type": "text"}]})


def test_merge_manual_columns_requires_inferred_schema() -> None:
    with pytest.raises(ValueError, match="valida el SQL"):
        merge_manual_columns(None, {"columns": []})
