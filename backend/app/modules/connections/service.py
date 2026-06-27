"""Lógica de negocio de conexiones: CRUD + prueba de conexión.

La contraseña se cifra al crear/actualizar (`app.core.security`). La prueba
abre una conexión real, fuerza modo de solo lectura y ejecuta `SELECT 1`,
actualizando el `status` según el resultado (§6.2, §9.1).
"""

import uuid

import psycopg
from sqlmodel import Session, select

from app.core.security import decrypt_secret, encrypt_secret
from app.modules.auth.models import CurrentUser
from app.modules.connections.models import (
    Connection,
    ConnectionEngine,
    ConnectionStatus,
)
from app.modules.connections.schemas import (
    ConnectionCreate,
    ConnectionTestResult,
    ConnectionUpdate,
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
        password = decrypt_secret(connection.encrypted_password)
        conninfo = psycopg.conninfo.make_conninfo(
            host=connection.host,
            port=connection.port,
            dbname=connection.database,
            user=connection.username,
            password=password,
            connect_timeout=_CONNECT_TIMEOUT_SECONDS,
            sslmode="require" if connection.ssl_enabled else "prefer",
        )
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
