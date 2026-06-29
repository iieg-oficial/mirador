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
from sqlmodel import Session, select

from app.core.cache import get_cached, invalidate, set_cached
from app.core.security import decrypt_secret
from app.core.sql_guard import validate_sql
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


# ── CRUD ─────────────────────────────────────────────────────────────────────


def list_datasets(session: Session) -> list[Dataset]:
    return list(
        session.exec(
            select(Dataset).where(Dataset.status != DatasetStatus.archived)
        ).all()
    )


def get_dataset(session: Session, dataset_id: uuid.UUID) -> Dataset | None:
    return session.get(Dataset, dataset_id)


def create_dataset(session: Session, data: DatasetCreate, user: CurrentUser) -> Dataset:
    validate_sql(data.sql_query)
    obj = Dataset(
        **data.model_dump(),
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def update_dataset(session: Session, obj: Dataset, data: DatasetUpdate) -> Dataset:
    fields = data.model_dump(exclude_unset=True)
    if "sql_query" in fields:
        validate_sql(fields["sql_query"])
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


def validate_dataset(session: Session, obj: Dataset, connection: Connection) -> Dataset:
    """Valida el SQL contra la BD real e infiere columnas. Actualiza status → validated."""
    if connection.engine not in _POSTGRES_ENGINES:
        raise ValueError(f"Validación no soportada para el motor '{connection.engine.value}'.")

    validate_sql(obj.sql_query)

    # Ejecutar LIMIT 0 solo para obtener los metadatos de las columnas.
    psycopg_sql = _named_to_psycopg(obj.sql_query)
    limited = f"SELECT * FROM ({psycopg_sql}) AS _v LIMIT 0"

    with psycopg.connect(_make_conninfo(connection)) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute(f"SET statement_timeout = {_DEFAULT_STATEMENT_TIMEOUT_MS}")
            cur.execute(limited)
            cols = (
                [{"name": d.name, "data_type": _pg_type(d)} for d in cur.description]
                if cur.description
                else []
            )

    params = _extract_named_params(obj.sql_query)

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
            return PreviewResult(**cached)

    validate_sql(sql)
    psycopg_sql = _named_to_psycopg(sql)
    psycopg_params = params or {}

    conninfo = _make_conninfo(connection)
    t0 = time.monotonic()

    with psycopg.connect(conninfo) as conn:
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

            # Contar total de filas (best-effort; si falla no bloquea la respuesta).
            total_rows: int | None = None
            try:
                count_sql = f"SELECT COUNT(*) FROM ({psycopg_sql}) AS _cnt"
                cur.execute(count_sql, psycopg_params)
                count_row = cur.fetchone()
                total_rows = int(count_row[0]) if count_row else None
            except Exception:  # noqa: BLE001
                pass

    elapsed_ms = (time.monotonic() - t0) * 1000

    result = PreviewResult(
        columns=col_meta,
        rows=[dict(zip(col_names, row)) for row in raw_rows],
        total_rows=total_rows,
        truncated=truncated,
        elapsed_ms=round(elapsed_ms, 1),
    )

    # ── Cache store ────────────────────────────────────────────────────────────
    if dataset_id and cache_ttl_seconds > 0:
        set_cached(dataset_id, params, result.model_dump(), cache_ttl_seconds)

    return result


# ── Helpers internos ──────────────────────────────────────────────────────────


def _make_conninfo(connection: Connection) -> str:
    password = decrypt_secret(connection.encrypted_password)
    return psycopg.conninfo.make_conninfo(
        host=connection.host,
        port=connection.port,
        dbname=connection.database,
        user=connection.username,
        password=password,
        connect_timeout=_CONNECT_TIMEOUT_SECONDS,
        sslmode="require" if connection.ssl_enabled else "prefer",
    )


def _named_to_psycopg(sql: str) -> str:
    """Convierte parámetros :name → %(name)s (estilo psycopg named)."""
    return re.sub(r":([a-zA-Z_][a-zA-Z0-9_]*)", r"%(\1)s", sql)


def _extract_named_params(sql: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r":([a-zA-Z_][a-zA-Z0-9_]*)", sql)))


def _pg_type(desc: Any) -> str:
    """Devuelve el nombre del tipo PostgreSQL a partir del descriptor de cursor."""
    try:
        return desc.type_display or str(desc.type_code)
    except AttributeError:
        return str(getattr(desc, "type_code", "unknown"))
