"""Tests del query builder de charts (RF-07): SQL generado por caso, whitelist
de columnas y que el SQL compuesto pase la red de seguridad de sql_guard."""

import uuid
from typing import Any

import pytest

from app.core.sql_guard import validate_sql
from app.modules.charts.query_builder import build_query
from app.modules.charts.spec import ChartSpec
from app.modules.datasets.models import Dataset, DatasetStatus

_COLUMNS = [
    {"name": "municipio", "data_type": "text"},
    {"name": "region", "data_type": "text"},
    {"name": "poblacion", "data_type": "int8"},
    {"name": "anio", "data_type": "int4"},
]


def _dataset(sql: str = "SELECT * FROM mart.poblacion", max_rows: int = 1000) -> Dataset:
    return Dataset(
        connection_id=uuid.uuid4(),
        name="Población",
        slug="poblacion",
        sql_query=sql,
        columns_schema={"columns": _COLUMNS},
        max_rows=max_rows,
        status=DatasetStatus.validated,
    )


def _spec(**overrides: Any) -> ChartSpec:
    base: dict[str, Any] = {
        "version": "1.0",
        "data": {"dataset_id": str(uuid.uuid4()), "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar"},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }
    for key, value in overrides.items():
        base[key] = value
    return ChartSpec.model_validate(base)


def test_build_query_aggregation_and_group_by() -> None:
    sql, params, limit = build_query(_spec(), _dataset())
    assert sql == (
        'SELECT "municipio", SUM("poblacion") AS "poblacion" '
        "FROM (SELECT * FROM mart.poblacion) AS _ds "
        'GROUP BY "municipio"'
    )
    assert params == {}
    assert limit == 100
    validate_sql(sql)  # red de seguridad: debe ser un SELECT válido


def test_build_query_passthrough_without_aggregation() -> None:
    spec = _spec(
        visual={"chart_type": "scatter"},
        encodings={"x": [{"field": "anio"}], "y": [{"field": "poblacion"}]},
    )
    sql, params, _ = build_query(spec, _dataset())
    assert "GROUP BY" not in sql
    assert sql.startswith('SELECT "anio", "poblacion" FROM')
    validate_sql(sql)


def test_build_query_filters_every_operator() -> None:
    filters = [
        {"field": "anio", "operator": "=", "value": 2025},
        {"field": "poblacion", "operator": ">=", "value": 1000},
        {"field": "region", "operator": "in", "value": ["Centro", "Norte"]},
        {"field": "region", "operator": "not_in", "value": ["Sur"]},
        {"field": "municipio", "operator": "contains", "value": "guadal"},
        {"field": "anio", "operator": "between", "value": [2020, 2025]},
        {"field": "region", "operator": "is_null"},
        {"field": "municipio", "operator": "is_not_null"},
    ]
    spec = _spec(data={"dataset_id": str(uuid.uuid4()), "filters": filters, "limit": 100})
    sql, params, _ = build_query(spec, _dataset())
    assert '"anio" = :_f0' in sql
    assert '"poblacion" >= :_f1' in sql
    assert '"region" = ANY(:_f2)' in sql
    assert '"region" != ALL(:_f3)' in sql
    assert '"municipio" ILIKE :_f4' in sql
    assert '"anio" BETWEEN :_f5a AND :_f5b' in sql
    assert '"region" IS NULL' in sql
    assert '"municipio" IS NOT NULL' in sql
    assert params == {
        "_f0": 2025,
        "_f1": 1000,
        "_f2": ["Centro", "Norte"],
        "_f3": ["Sur"],
        "_f4": "%guadal%",
        "_f5a": 2020,
        "_f5b": 2025,
    }
    validate_sql(sql)


def test_build_query_sort_and_limit_cap() -> None:
    spec = _spec(
        data={
            "dataset_id": str(uuid.uuid4()),
            "sort": [{"field": "poblacion", "direction": "desc"}, {"field": "municipio"}],
            "limit": 50000,
        }
    )
    sql, _, limit = build_query(spec, _dataset(max_rows=500))
    assert 'ORDER BY "poblacion" DESC, "municipio" ASC' in sql
    assert limit == 500  # cap por max_rows del dataset
    validate_sql(sql)


def test_build_query_rejects_unknown_column() -> None:
    spec = _spec(encodings={"x": [{"field": "municipio"}], "y": [{"field": "hackeo"}]})
    with pytest.raises(ValueError, match="hackeo"):
        build_query(spec, _dataset())


def test_build_query_rejects_injection_via_field_name() -> None:
    # Un nombre malicioso no está en el whitelist → rechazado antes de ensamblar.
    spec = _spec(
        encodings={
            "x": [{"field": 'municipio"; DROP TABLE x; --'}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        }
    )
    with pytest.raises(ValueError, match="inexistentes"):
        build_query(spec, _dataset())


def test_build_query_dedupes_and_aliases_double_aggregation() -> None:
    spec = _spec(
        encodings={
            "x": [{"field": "municipio"}],
            "y": [
                {"field": "poblacion", "aggregation": "sum"},
                {"field": "poblacion", "aggregation": "avg"},
                {"field": "poblacion", "aggregation": "sum"},  # duplicado exacto
            ],
        }
    )
    sql, _, _ = build_query(spec, _dataset())
    assert sql.count('SUM("poblacion")') == 1
    assert 'AVG("poblacion") AS "poblacion_avg"' in sql
    validate_sql(sql)


def test_build_query_named_fields_candlestick() -> None:
    columns = [
        {"name": "fecha", "data_type": "date"},
        {"name": "apertura", "data_type": "numeric"},
        {"name": "cierre", "data_type": "numeric"},
        {"name": "minimo", "data_type": "numeric"},
        {"name": "maximo", "data_type": "numeric"},
    ]
    dataset = _dataset()
    dataset.columns_schema = {"columns": columns}
    spec = _spec(
        visual={"chart_type": "candlestick"},
        encodings={
            "x": [{"field": "fecha"}],
            "fields": {
                "open": "apertura",
                "close": "cierre",
                "lowest": "minimo",
                "highest": "maximo",
            },
        },
    )
    sql, _, _ = build_query(spec, dataset)
    for col in ("fecha", "apertura", "cierre", "minimo", "maximo"):
        assert f'"{col}"' in sql
    assert "GROUP BY" not in sql
    validate_sql(sql)


def test_build_query_requires_columns_schema() -> None:
    dataset = _dataset()
    dataset.columns_schema = None
    with pytest.raises(ValueError, match="valida el SQL"):
        build_query(_spec(), dataset)


def test_build_query_dataset_sql_with_trailing_semicolon() -> None:
    sql, _, _ = build_query(_spec(), _dataset(sql="SELECT * FROM mart.poblacion;"))
    assert ";" not in sql
    validate_sql(sql)
