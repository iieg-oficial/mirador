"""Armado del conninfo de psycopg hacia una BD externa declarada en `connections`.

Compartido entre `connections` (prueba de conexión, exploración de esquema) y
`datasets` (playground, ejecución) — antes duplicado idéntico en ambos
módulos salvo por el timeout (REVISION_CODIGO.md #8).
"""

import psycopg

from app.core.security import decrypt_secret
from app.modules.connections.models import Connection


def make_conninfo(connection: Connection, connect_timeout: int) -> str:
    password = decrypt_secret(connection.encrypted_password)
    return psycopg.conninfo.make_conninfo(
        host=connection.host,
        port=connection.port,
        dbname=connection.database,
        user=connection.username,
        password=password,
        connect_timeout=connect_timeout,
        sslmode="require" if connection.ssl_enabled else "prefer",
    )
