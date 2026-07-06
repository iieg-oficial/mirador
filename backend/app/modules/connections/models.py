"""Modelo de conexión a base de datos (Bloque C).

Cada `Connection` es una fuente de datos registrada por un administrador. Ver
`tablerillos.md` §6.2. Reglas de seguridad (§9.1):

* La contraseña NUNCA se guarda en texto plano: se cifra con Fernet
  (`app.core.security.encrypt_secret`) y se persiste en `encrypted_password`.
* Las conexiones de consulta deben ser de solo lectura (`read_only`).
* La cadena de conexión y la contraseña jamás se exponen al frontend
  (ver `schemas.ConnectionRead`).
"""

import enum

from sqlmodel import Field, Relationship

from app.modules.tags.models import ConnectionTag, Tag
from app.shared.models import UUIDAuditBase


class ConnectionEngine(str, enum.Enum):
    """Motores soportados en el MVP (§6.2)."""

    postgresql = "postgresql"
    postgis = "postgis"
    duckdb = "duckdb"


class ConnectionStatus(str, enum.Enum):
    """Estado operativo de la conexión (§6.2)."""

    activa = "activa"
    inactiva = "inactiva"
    error = "error"
    archivada = "archivada"


class Connection(UUIDAuditBase, table=True):
    """Conexión a una fuente de datos externa."""

    __tablename__ = "connections"

    name: str = Field(index=True, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    engine: ConnectionEngine = Field(default=ConnectionEngine.postgresql)
    host: str = Field(max_length=255)
    port: int = Field(default=5432)
    database: str = Field(max_length=255)
    username: str = Field(max_length=255)
    # Contraseña cifrada con Fernet. Nunca en texto plano, nunca al frontend.
    encrypted_password: str = Field()
    ssl_enabled: bool = Field(default=False)
    # sslmode explícito de psycopg (disable…verify-full). Si es None se deriva de
    # `ssl_enabled` (require/prefer). Permite exigir TLS estricto por conexión.
    ssl_mode: str | None = Field(default=None, max_length=20)
    read_only: bool = Field(default=True)
    status: ConnectionStatus = Field(default=ConnectionStatus.inactiva)
    # Resultado/diagnóstico de la última prueba de conexión (legible).
    last_test_error: str | None = Field(default=None, max_length=500)
    tags: list[Tag] = Relationship(link_model=ConnectionTag)
