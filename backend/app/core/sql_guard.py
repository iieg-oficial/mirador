"""Guardia de SQL para datasets: valida que sólo se ejecuten SELECT seguros.

Defensa en capas (§9.2):
1. Parser sqlglot: un solo statement, raíz SELECT o WITH...SELECT.
2. Detección de escritura por AST: se rechaza cualquier nodo INSERT/UPDATE/DELETE/
   DDL en todo el árbol (cubre CTEs con escritura, p. ej. `WITH x AS (INSERT…)`).
3. Blacklist acotada a funciones peligrosas (lectura/escritura de archivos,
   ejecución, dblink), por patrón de llamada para no chocar con identificadores.
4. La transacción READ ONLY y statement_timeout se aplican en service.py.

A diferencia de una blacklist de keywords sobre texto crudo, el chequeo por AST
no rechaza SELECT legítimos que referencian columnas llamadas `owner`, `comment`,
`update`, etc.
"""

import re

import sqlglot
from sqlglot import expressions as exp

_MAX_SQL_LENGTH = 10_000

# Nodos que escriben o cambian estado; prohibidos en cualquier parte del árbol.
# `Command` cubre lo que sqlglot no sabe parsear (VACUUM, SET ROLE, …), que no
# tiene cabida en un SELECT puro.
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Merge,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.TruncateTable,
    exp.Grant,
    exp.Copy,
    exp.Command,
)

# Funciones peligrosas: se detectan por patrón de llamada `func(` para no rechazar
# identificadores homónimos (una columna llamada `dblink` sí se permite).
_DANGEROUS_FUNCS = re.compile(
    r"\b(pg_read_file|pg_read_binary_file|pg_write_file|pg_ls_dir"
    r"|pg_execute_server_program|lo_import|lo_export|dblink|dblink_exec)\s*\(",
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

    m = _DANGEROUS_FUNCS.search(sql)
    if m:
        raise ValueError(f"Función no permitida en la consulta: '{m.group(1)}'.")

    try:
        statements = sqlglot.parse(sql, dialect="postgres")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"SQL inválido: {exc}") from exc

    if not statements or len(statements) != 1:
        raise ValueError("Solo se permite un statement por consulta.")

    stmt = statements[0]
    if stmt is None:
        raise ValueError("La consulta está vacía.")

    # La raíz debe ser SELECT puro o WITH ... SELECT (CTEs).
    if isinstance(stmt, exp.Select):
        root_select = stmt
    elif isinstance(stmt, exp.With) and isinstance(stmt.this, exp.Select):
        root_select = stmt.this
    else:
        raise ValueError(
            f"Solo se permiten consultas SELECT (o WITH…SELECT). "
            f"Se recibió: {type(stmt).__name__}."
        )

    # `SELECT ... INTO` escribe una tabla; sqlglot lo parsea como Select.
    if root_select.args.get("into"):
        raise ValueError("No se permite SELECT ... INTO.")

    # Ningún nodo de escritura/DDL en el árbol (incluye CTEs con escritura).
    for node in stmt.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise ValueError(
                f"Operación no permitida en la consulta: '{type(node).__name__.upper()}'."
            )
