"""Guardia de SQL para datasets: valida que sólo se ejecuten SELECT seguros.

Defensa en capas (§9.2):
1. Parser sqlglot: un solo statement, raíz SELECT o WITH...SELECT.
2. Lista negra de keywords peligrosos como red de seguridad adicional.
3. La transacción READ ONLY y statement_timeout se aplican en service.py.
"""

import re

import sqlglot
from sqlglot import expressions as exp

_MAX_SQL_LENGTH = 10_000

# Lista negra como defensa secundaria al parser (cubre edge-cases de dialectos).
_BLACKLIST = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|CALL|COPY"
    r"|VACUUM|ANALYZE|CLUSTER|REINDEX|CHECKPOINT|LOCK|NOTIFY|LISTEN|UNLISTEN|COMMENT"
    r"|SECURITY|OWNER|SET\s+ROLE|RESET\s+ROLE|pg_read_file|pg_write_file"
    r"|pg_execute_server_program|lo_import|lo_export)\b",
    re.IGNORECASE,
)


def normalize_sql(sql: str) -> str:
    """Quita espacios y un ';' final (típico al copiar/pegar SQL). No toca
    statements internos: si hay más de uno, validate_sql lo seguirá rechazando."""
    return sql.strip().rstrip(";").strip()


def validate_sql(sql: str) -> None:
    """Valida que `sql` sea un SELECT seguro. Lanza ValueError si no lo es."""
    sql = normalize_sql(sql)
    if not sql:
        raise ValueError("La consulta no puede estar vacía.")
    if len(sql) > _MAX_SQL_LENGTH:
        raise ValueError(f"La consulta excede el máximo de {_MAX_SQL_LENGTH} caracteres.")

    m = _BLACKLIST.search(sql)
    if m:
        raise ValueError(f"Keyword no permitido en la consulta: '{m.group().upper()}'.")

    try:
        statements = sqlglot.parse(sql, dialect="postgres")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"SQL inválido: {exc}") from exc

    if not statements or len(statements) != 1:
        raise ValueError("Solo se permite un statement por consulta.")

    stmt = statements[0]
    if stmt is None:
        raise ValueError("La consulta está vacía.")

    # Acepta SELECT puro o WITH ... SELECT (CTEs). `SELECT ... INTO` escribe una
    # tabla y sqlglot lo parsea como Select: se rechaza por el AST (la lista negra
    # no cubre INTO), no dependemos solo de la transacción READ ONLY.
    if isinstance(stmt, exp.Select):
        if stmt.args.get("into"):
            raise ValueError("No se permite SELECT ... INTO.")
        return
    if isinstance(stmt, exp.With) and isinstance(stmt.this, exp.Select):
        if stmt.this.args.get("into"):
            raise ValueError("No se permite SELECT ... INTO.")
        return

    raise ValueError(
        f"Solo se permiten consultas SELECT (o WITH…SELECT). "
        f"Se recibió: {type(stmt).__name__}."
    )
