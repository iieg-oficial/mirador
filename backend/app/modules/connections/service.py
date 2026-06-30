"""Lógica de negocio de conexiones: CRUD + prueba de conexión.

La contraseña se cifra al crear/actualizar (`app.core.security`). La prueba
abre una conexión real, fuerza modo de solo lectura y ejecuta `SELECT 1`,
actualizando el `status` según el resultado (§6.2, §9.1).
"""

import uuid

import psycopg
from sqlmodel import Session, select

from app.core.db_external import make_conninfo
from app.core.security import encrypt_secret
from app.modules.auth.models import CurrentUser
from app.modules.connections.models import (
    Connection,
    ConnectionEngine,
    ConnectionStatus,
)
from app.modules.connections.schemas import (
    ColumnInfo,
    ConnectionCreate,
    ConnectionTestResult,
    ConnectionUpdate,
    SchemaGroup,
    SchemaObject,
    SchemaObjectType,
    SchemaResponse,
)

# Motores que se prueban abriendo una conexión psycopg.
_POSTGRES_ENGINES = {ConnectionEngine.postgresql, ConnectionEngine.postgis}

# Tiempo máximo para abrir la conexión y para el SELECT de prueba.
_CONNECT_TIMEOUT_SECONDS = 5
_TEST_STATEMENT_TIMEOUT_MS = 5000


def list_connections(session: Session) -> list[Connection]:
    return list(session.exec(select(Connection)).all())


def get_connection(session: Session, connection_id: uuid.UUID) -> Connection | None:
    return session.get(Connection, connection_id)


def create_connection(session: Session, data: ConnectionCreate, user: CurrentUser) -> Connection:
    connection = Connection(
        name=data.name,
        description=data.description,
        engine=data.engine,
        host=data.host,
        port=data.port,
        database=data.database,
        username=data.username,
        encrypted_password=encrypt_secret(data.password),
        ssl_enabled=data.ssl_enabled,
        read_only=data.read_only,
        status=ConnectionStatus.inactiva,
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(connection)
    session.commit()
    session.refresh(connection)
    return connection


def update_connection(
    session: Session, connection: Connection, data: ConnectionUpdate
) -> Connection:
    fields = data.model_dump(exclude_unset=True)
    password = fields.pop("password", None)
    if password is not None:
        connection.encrypted_password = encrypt_secret(password)
    for key, value in fields.items():
        setattr(connection, key, value)
    session.add(connection)
    session.commit()
    session.refresh(connection)
    return connection


def delete_connection(session: Session, connection: Connection) -> None:
    """Baja lógica: se archiva, no se borra (§9.1, "permitir desactivar")."""
    connection.status = ConnectionStatus.archivada
    session.add(connection)
    session.commit()


def test_connection(session: Session, connection: Connection) -> ConnectionTestResult:
    """Abre la conexión en modo solo lectura y ejecuta `SELECT 1`.

    Actualiza `status` a `activa` si tiene éxito, o `error` si falla, y
    persiste el diagnóstico en `last_test_error`.
    """
    if connection.engine not in _POSTGRES_ENGINES:
        detail = f"Prueba no soportada aún para el motor {connection.engine.value}."
        _persist_test(session, connection, ConnectionStatus.inactiva, detail)
        return ConnectionTestResult(success=False, status=connection.status, detail=detail)

    try:
        conninfo = make_conninfo(connection, _CONNECT_TIMEOUT_SECONDS)
        with psycopg.connect(conninfo, autocommit=False) as conn:
            # Defensa: transacción de solo lectura + timeout de statement.
            conn.read_only = True
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {_TEST_STATEMENT_TIMEOUT_MS}")
                cur.execute("SELECT 1")
                cur.fetchone()
    except Exception as exc:  # noqa: BLE001 — cualquier fallo => status error
        detail = str(exc).strip() or exc.__class__.__name__
        _persist_test(session, connection, ConnectionStatus.error, detail[:500])
        return ConnectionTestResult(
            success=False, status=connection.status, detail=connection.last_test_error
        )

    _persist_test(session, connection, ConnectionStatus.activa, None)
    return ConnectionTestResult(success=True, status=connection.status, detail=None)


def _persist_test(
    session: Session,
    connection: Connection,
    status: ConnectionStatus,
    error: str | None,
) -> None:
    connection.status = status
    connection.last_test_error = error
    session.add(connection)
    session.commit()
    session.refresh(connection)


# ── Exploración de esquema ────────────────────────────────────────────────────


def get_schema(connection: Connection) -> SchemaResponse:
    """Lista esquemas, tablas, vistas y vistas materializadas de la BD externa."""
    if connection.engine not in _POSTGRES_ENGINES:
        raise ValueError(
            f"Exploración de esquema no disponible para el motor '{connection.engine.value}'."
        )

    schema_map: dict[str, list[SchemaObject]] = {}

    with psycopg.connect(make_conninfo(connection, _CONNECT_TIMEOUT_SECONDS)) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            # Hardcodeamos los esquemas del sistema; no son entrada de usuario.
            cur.execute("""
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY table_schema, table_name
            """)
            for schema, name, t in cur.fetchall():
                schema_map.setdefault(schema, []).append(
                    SchemaObject(
                        name=name,
                        type=SchemaObjectType.view if t == "VIEW" else SchemaObjectType.table,
                    )
                )

            cur.execute("""
                SELECT schemaname, matviewname
                FROM pg_matviews
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY schemaname, matviewname
            """)
            for schema, name in cur.fetchall():
                schema_map.setdefault(schema, []).append(
                    SchemaObject(name=name, type=SchemaObjectType.materialized_view)
                )

    return SchemaResponse(
        schemas=[SchemaGroup(name=s, objects=objs) for s, objs in sorted(schema_map.items())]
    )


def get_columns(connection: Connection, schema_name: str, object_name: str) -> list[ColumnInfo]:
    """Devuelve columnas de una tabla, vista o vista materializada externa."""
    if connection.engine not in _POSTGRES_ENGINES:
        raise ValueError(
            f"Inspección de columnas no disponible para el motor '{connection.engine.value}'."
        )

    with psycopg.connect(make_conninfo(connection, _CONNECT_TIMEOUT_SECONDS)) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            # pg_attribute cubre tablas, vistas Y vistas materializadas.
            cur.execute(
                """
                SELECT
                    a.attname,
                    pg_catalog.format_type(a.atttypid, a.atttypmod),
                    NOT a.attnotnull,
                    pg_get_expr(d.adbin, d.adrelid)
                FROM pg_catalog.pg_attribute a
                LEFT JOIN pg_catalog.pg_attrdef d
                    ON (a.attrelid = d.adrelid AND a.attnum = d.adnum)
                WHERE a.attrelid = (
                    SELECT c.oid
                    FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = %s AND c.relname = %s
                )
                AND a.attnum > 0 AND NOT a.attisdropped
                ORDER BY a.attnum
                """,
                (schema_name, object_name),
            )
            rows = cur.fetchall()

    return [
        ColumnInfo(name=name, data_type=dtype, nullable=nullable, default=default)
        for name, dtype, nullable, default in rows
    ]
