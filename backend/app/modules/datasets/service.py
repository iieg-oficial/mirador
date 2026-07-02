"""Lógica de negocio del módulo datasets: CRUD + playground de ejecución.

Seguridad SQL (§9.2):
- validate_sql() rechaza todo lo que no sea SELECT/WITH…SELECT.
- La conexión a la BD externa siempre abre en modo READ ONLY.
- statement_timeout limita el tiempo de ejecución.
- Los parámetros de usuario se pasan como bind variables (sin concatenación).
"""

import re
import time
import uuid
from typing import Any

import psycopg
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.cache import get_cached, invalidate, set_cached
from app.core.db_external import make_conninfo
from app.core.sql_guard import normalize_sql, validate_sql
from app.modules.auth.models import CurrentUser
from app.modules.connections.models import Connection, ConnectionEngine
from app.modules.datasets.models import Dataset, DatasetStatus
from app.modules.datasets.schemas import (
    ColumnMeta,
    DatasetCreate,
    DatasetUpdate,
    PreviewResult,
)

_POSTGRES_ENGINES = {ConnectionEngine.postgresql, ConnectionEngine.postgis}

_CONNECT_TIMEOUT_SECONDS = 10
_DEFAULT_STATEMENT_TIMEOUT_MS = 15_000

# (?<!:) evita que el segundo ':' de un cast Postgres (p. ej. `::date`) se
# confunda con un parámetro nombrado.
_NAMED_PARAM_RE = re.compile(r"(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)")

# ── Inferencia semántica de columnas ─────────────────────────────────────────

_NUMERIC_TYPES = {
    "int2", "int4", "int8", "smallint", "integer", "bigint",
    "numeric", "decimal", "float4", "float8", "real", "double precision", "money",
}
_TEMPORAL_TYPES = {"date", "time", "timetz", "timestamp", "timestamptz", "interval"}
_BOOL_TYPES = {"bool", "boolean"}
_GEO_TYPES = {"geometry", "geography"}
# Columnas que por nombre son identificadores (id, *_id, cve_*, clave_*):
# dimensiones de unión, no métricas aunque sean numéricas.
_ID_NAME_RE = re.compile(r"(^id$|_id$|^cve_|_cve$|^clave(_|$))")


def infer_semantics(name: str, data_type: str) -> dict[str, Any]:
    """Infiere la metadata semántica de una columna desde su nombre y tipo PG.

    Es un punto de partida editable: el analista puede corregirla después vía
    `DatasetUpdate.columns_schema` (p. ej. marcar un texto largo como 'texto'
    en vez de 'categorica').
    """
    dt = data_type.lower()
    label = name.replace("_", " ").strip().capitalize()
    if _ID_NAME_RE.search(name.lower()):
        sem, dim, met, aggs = "identificador", True, False, ["count", "count_distinct"]
    elif dt in _GEO_TYPES:
        sem, dim, met, aggs = "geografica", False, False, []
    elif dt in _NUMERIC_TYPES:
        sem, dim, met, aggs = "metrica", False, True, ["sum", "avg", "min", "max", "count"]
    elif dt in _TEMPORAL_TYPES:
        sem, dim, met, aggs = "temporal", True, False, ["min", "max", "count"]
    elif dt in _BOOL_TYPES:
        sem, dim, met, aggs = "booleano", True, False, ["count"]
    else:
        sem, dim, met, aggs = "categorica", True, False, ["count", "count_distinct"]
    return {
        "semantic_type": sem,
        "label": label,
        "is_dimension": dim,
        "is_metric": met,
        "aggregations": aggs,
    }


def merge_manual_columns(current_schema: dict | None, manual: dict) -> dict:
    """Aplica una edición manual de metadata sobre el schema de columnas vigente.

    - Los nombres del payload deben existir en el schema inferido.
    - `data_type` no es editable (siempre se conserva el inferido).
    - Las columnas no incluidas en el payload conservan su metadata actual.
    """
    current = {c["name"]: c for c in (current_schema or {}).get("columns", [])}
    if not current:
        raise ValueError("El dataset no tiene columnas inferidas; valida el SQL primero.")
    incoming = {c["name"]: c for c in manual.get("columns", [])}
    unknown = sorted(set(incoming) - set(current))
    if unknown:
        raise ValueError(f"Columnas inexistentes en el dataset: {', '.join(unknown)}.")
    merged = [
        {**incoming.get(name, col), "name": name, "data_type": col["data_type"]}
        for name, col in current.items()
    ]
    return {"columns": merged}


# ── CRUD ─────────────────────────────────────────────────────────────────────


def list_datasets(session: Session) -> list[Dataset]:
    return list(
        session.exec(
            select(Dataset).where(Dataset.status != DatasetStatus.archived)
        ).all()
    )


def get_dataset(session: Session, dataset_id: uuid.UUID) -> Dataset | None:
    return session.get(Dataset, dataset_id)


def create_dataset(
    session: Session, data: DatasetCreate, user: CurrentUser, connection: Connection
) -> Dataset:
    validate_sql(data.sql_query)
    payload = data.model_dump()
    payload["sql_query"] = normalize_sql(payload["sql_query"])
    cols, params = _infer_schema(connection, payload["sql_query"])
    obj = Dataset(
        **payload,
        created_by=user.sub,
        created_by_email=user.email,
        columns_schema={"columns": cols},
        parameters_schema={"params": [{"name": p} for p in params]},
        status=DatasetStatus.validated,
    )
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def update_dataset(
    session: Session, obj: Dataset, data: DatasetUpdate, connection: Connection
) -> Dataset:
    fields = data.model_dump(exclude_unset=True)
    manual_columns = fields.pop("columns_schema", None)
    if "sql_query" in fields:
        validate_sql(fields["sql_query"])
        fields["sql_query"] = normalize_sql(fields["sql_query"])
        cols, params = _infer_schema(connection, fields["sql_query"])
        fields["columns_schema"] = {"columns": cols}
        fields["parameters_schema"] = {"params": [{"name": p} for p in params]}
        fields["status"] = DatasetStatus.validated
    if manual_columns is not None:
        # La edición manual se aplica sobre el schema vigente (el re-inferido
        # si en la misma petición también cambió el SQL).
        base_schema = fields.get("columns_schema", obj.columns_schema)
        fields["columns_schema"] = merge_manual_columns(base_schema, manual_columns)
    for key, value in fields.items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    invalidate(str(obj.id))
    return obj


def delete_dataset(session: Session, obj: Dataset) -> None:
    obj.status = DatasetStatus.archived
    session.add(obj)
    session.commit()
    invalidate(str(obj.id))


# ── Validación activa ─────────────────────────────────────────────────────────


def _connect(conninfo: str) -> psycopg.Connection:  # type: ignore[type-arg]
    """Abre la conexión a la BD externa; si no está disponible responde 503.

    Punto único por donde pasan preview, playground, validación y gráficas.
    Solo envuelve el connect: un timeout de consulta (QueryCanceled, también
    OperationalError) ocurre en execute() y sigue cayendo en los 502 de los
    routers.
    """
    try:
        return psycopg.connect(conninfo)
    except psycopg.OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "No se pudo conectar a la base de datos externa. "
                "Verifica la conexión o inténtalo más tarde."
            ),
        ) from exc


def _infer_schema(connection: Connection, sql: str) -> tuple[list[dict[str, str]], list[str]]:
    """Ejecuta `sql` con LIMIT 0 contra la BD real e infiere columnas y parámetros.

    Se usa tanto al crear/actualizar un dataset (validación obligatoria antes de
    guardar, §6.3) como en el endpoint explícito de re-validación.
    """
    if connection.engine not in _POSTGRES_ENGINES:
        raise ValueError(f"Validación no soportada para el motor '{connection.engine.value}'.")

    psycopg_sql = _named_to_psycopg(normalize_sql(sql))
    limited = f"SELECT * FROM ({psycopg_sql}) AS _v LIMIT 0"

    with _connect(_make_conninfo(connection)) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute(f"SET statement_timeout = {_DEFAULT_STATEMENT_TIMEOUT_MS}")
            cur.execute(limited)
            cols = (
                [
                    {
                        "name": d.name,
                        "data_type": _pg_type(d),
                        **infer_semantics(d.name, _pg_type(d)),
                    }
                    for d in cur.description
                ]
                if cur.description
                else []
            )

    params = _extract_named_params(sql)
    return cols, params


def validate_dataset(session: Session, obj: Dataset, connection: Connection) -> Dataset:
    """Valida el SQL contra la BD real e infiere columnas. Actualiza status → validated."""
    validate_sql(obj.sql_query)
    cols, params = _infer_schema(connection, obj.sql_query)

    obj.columns_schema = {"columns": cols}
    obj.parameters_schema = {"params": [{"name": p} for p in params]}
    obj.status = DatasetStatus.validated
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


# ── Ejecución / playground ────────────────────────────────────────────────────


def run_query(
    connection: Connection,
    sql: str,
    params: dict[str, Any],
    max_rows: int,
    timeout_ms: int = _DEFAULT_STATEMENT_TIMEOUT_MS,
    dataset_id: str | None = None,
    cache_ttl_seconds: int = 0,
) -> PreviewResult:
    """Ejecuta `sql` de forma segura y devuelve filas limitadas + estadísticas.

    Si se proveen `dataset_id` y `cache_ttl_seconds > 0`, el resultado se
    cachea en Redis para evitar re-ejecutar la misma query en cada petición.
    El playground no pasa dataset_id → nunca cachea.
    """
    if connection.engine not in _POSTGRES_ENGINES:
        raise ValueError(
            f"Ejecución no soportada para el motor '{connection.engine.value}'."
        )

    # ── Cache hit ──────────────────────────────────────────────────────────────
    if dataset_id and cache_ttl_seconds > 0:
        cached = get_cached(dataset_id, params)
        if cached is not None:
            return PreviewResult.model_validate(cached)

    validate_sql(sql)
    psycopg_sql = _named_to_psycopg(normalize_sql(sql))
    psycopg_params = params or {}

    conninfo = _make_conninfo(connection)
    t0 = time.monotonic()

    with _connect(conninfo) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute(f"SET statement_timeout = {timeout_ms}")

            # Obtener filas limitadas (max_rows + 1 para detectar truncamiento).
            limited_sql = f"SELECT * FROM ({psycopg_sql}) AS _rows LIMIT {max_rows + 1}"
            cur.execute(limited_sql, psycopg_params)
            raw_rows = cur.fetchall()
            col_meta = (
                [ColumnMeta(name=d.name, data_type=_pg_type(d)) for d in cur.description]
                if cur.description
                else []
            )

            truncated = len(raw_rows) > max_rows
            raw_rows = raw_rows[:max_rows]
            col_names = [c.name for c in col_meta]

            # Contar total de filas. Si no hubo truncamiento, len(raw_rows) ya
            # es el total exacto — evita un segundo roundtrip a la BD externa
            # (REVISION_CODIGO.md #7). Solo se ejecuta el COUNT(*) extra cuando
            # sí se truncó (ahí sí hace falta para saber el total real).
            if truncated:
                total_rows: int | None = None
                try:
                    count_sql = f"SELECT COUNT(*) FROM ({psycopg_sql}) AS _cnt"
                    cur.execute(count_sql, psycopg_params)
                    count_row = cur.fetchone()
                    total_rows = int(count_row[0]) if count_row else None
                except Exception:  # noqa: BLE001
                    pass
            else:
                total_rows = len(raw_rows)

    elapsed_ms = (time.monotonic() - t0) * 1000

    result = PreviewResult(
        columns=col_meta,
        rows=[dict(zip(col_names, row)) for row in raw_rows],
        total_rows=total_rows,
        truncated=truncated,
        elapsed_ms=round(elapsed_ms, 1),
    )
    # Serialización JSON-safe aplicada siempre, tanto si se cachea como si no:
    # garantiza que un hit y un miss devuelvan exactamente el mismo shape de
    # tipos (datetime/Decimal → str), en vez de depender de si pasó por Redis
    # (REVISION_CODIGO.md #6).
    json_safe = result.model_dump(mode="json")

    # ── Cache store ────────────────────────────────────────────────────────────
    if dataset_id and cache_ttl_seconds > 0:
        set_cached(dataset_id, params, json_safe, cache_ttl_seconds)

    return PreviewResult.model_validate(json_safe)


# ── Helpers internos ──────────────────────────────────────────────────────────


def _make_conninfo(connection: Connection) -> str:
    return make_conninfo(connection, _CONNECT_TIMEOUT_SECONDS)


def _named_to_psycopg(sql: str) -> str:
    """Convierte parámetros :name → %(name)s (estilo psycopg named).

    Dobla primero los `%` literales (p. ej. `LIKE '%2024%'`): psycopg usa binding
    pyformat cuando se pasan params, así que un `%` sin escapar aborta la ejecución.
    El doblado va antes de introducir los `%(name)s` reales para no tocarlos.
    """
    return _NAMED_PARAM_RE.sub(r"%(\1)s", sql.replace("%", "%%"))


def _extract_named_params(sql: str) -> list[str]:
    return list(dict.fromkeys(_NAMED_PARAM_RE.findall(sql)))


def _pg_type(desc: Any) -> str:
    """Devuelve el nombre del tipo PostgreSQL a partir del descriptor de cursor."""
    try:
        return desc.type_display or str(desc.type_code)
    except AttributeError:
        return str(getattr(desc, "type_code", "unknown"))
