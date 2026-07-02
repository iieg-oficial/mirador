"""Generación segura de SQL a partir de una ChartSpec (RF-07).

Nunca se acepta SQL libre desde la gráfica: la consulta se ensambla sobre el
SQL ya validado del dataset como subconsulta, usando exclusivamente columnas
del whitelist (columns_schema) — siempre entre comillas dobles — y valores de
filtros como parámetros nombrados (:_f0, :_f1, …). Como red de seguridad, el
SQL compuesto vuelve a pasar por sql_guard antes de ejecutarse (run_query).
"""

from typing import Any

from app.core.sql_guard import normalize_sql
from app.modules.charts.spec import ChartSpec, Encoding, FilterSpec
from app.modules.datasets.models import Dataset

_AGG_SQL = {
    "sum": "SUM({col})",
    "avg": "AVG({col})",
    "min": "MIN({col})",
    "max": "MAX({col})",
    "count": "COUNT({col})",
    "count_distinct": "COUNT(DISTINCT {col})",
}


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _select_encodings(spec: ChartSpec) -> list[Encoding]:
    """Encodings que aportan columnas al SELECT, en orden estable y sin duplicar."""
    enc = spec.encodings
    ordered = [*enc.x, *enc.y, enc.color, enc.size, *enc.tooltip]
    # Columnas nombradas (candlestick/boxplot) van como passthrough.
    ordered.extend(Encoding(field=v) for v in enc.fields.values() if v)
    seen: set[tuple[str, str | None]] = set()
    result = []
    for e in ordered:
        if e is None:
            continue
        key = (e.field, e.aggregation)
        if key not in seen:
            seen.add(key)
            result.append(e)
    return result


def _filter_clause(f: FilterSpec, idx: int, params: dict[str, Any]) -> str:
    col = _quote(f.field)
    p = f"_f{idx}"
    match f.operator:
        case "is_null":
            return f"{col} IS NULL"
        case "is_not_null":
            return f"{col} IS NOT NULL"
        case "in":
            params[p] = list(f.value)
            return f"{col} = ANY(:{p})"
        case "not_in":
            params[p] = list(f.value)
            return f"{col} != ALL(:{p})"
        case "contains":
            params[p] = f"%{f.value}%"
            return f"{col} ILIKE :{p}"
        case "between":
            params[f"{p}a"], params[f"{p}b"] = f.value[0], f.value[1]
            return f"{col} BETWEEN :{p}a AND :{p}b"
        case _:
            params[p] = f.value
            return f"{col} {f.operator} :{p}"


def build_query(spec: ChartSpec, dataset: Dataset) -> tuple[str, dict[str, Any], int]:
    """Ensambla la consulta desde la spec. Devuelve (sql, params, limit_efectivo).

    El SQL resultante no lleva LIMIT: el límite efectivo se aplica en
    run_query (que envuelve con LIMIT n+1 para detectar truncamiento).
    """
    known = {c["name"] for c in (dataset.columns_schema or {}).get("columns", [])}
    if not known:
        raise ValueError("El dataset no tiene columnas inferidas; valida el SQL primero.")

    selects = _select_encodings(spec)
    if not selects:
        raise ValueError("La spec no referencia ninguna columna en los encodings.")

    # Whitelist estricto: toda columna referenciada debe existir en el dataset.
    referenced = {e.field for e in selects}
    referenced.update(f.field for f in spec.data.filters)
    referenced.update(s.field for s in spec.data.sort)
    unknown = sorted(referenced - known)
    if unknown:
        raise ValueError(f"Columnas inexistentes en el dataset: {', '.join(unknown)}.")

    # SELECT: alias = nombre del campo; si el mismo campo aparece con dos
    # agregaciones distintas, la segunda se aliasa campo_agregacion.
    has_agg = any(e.aggregation for e in selects)
    select_items: list[str] = []
    group_items: list[str] = []
    used_aliases: set[str] = set()
    for e in selects:
        if e.aggregation:
            alias = e.field if e.field not in used_aliases else f"{e.field}_{e.aggregation}"
            select_items.append(
                f"{_AGG_SQL[e.aggregation].format(col=_quote(e.field))} AS {_quote(alias)}"
            )
        else:
            alias = e.field
            select_items.append(_quote(e.field))
            group_items.append(_quote(e.field))
        used_aliases.add(alias)

    params: dict[str, Any] = {}
    where_clauses = [
        _filter_clause(f, i, params) for i, f in enumerate(spec.data.filters)
    ]

    sql = f"SELECT {', '.join(select_items)} FROM ({normalize_sql(dataset.sql_query)}) AS _ds"
    if where_clauses:
        sql += f" WHERE {' AND '.join(where_clauses)}"
    if has_agg and group_items:
        sql += f" GROUP BY {', '.join(group_items)}"
    if spec.data.sort:
        order = ", ".join(
            f"{_quote(s.field)} {'DESC' if s.direction == 'desc' else 'ASC'}"
            for s in spec.data.sort
        )
        sql += f" ORDER BY {order}"

    limit = min(spec.data.limit, dataset.max_rows)
    return sql, params, limit
