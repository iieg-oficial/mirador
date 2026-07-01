# Seguridad — Tablerillos

> Stub inicial (Fase 0). Se amplía con la implementación.

## Autenticación / autorización

Delegada a Minerva (OIDC, modelo BFF). Tokens nunca en el navegador; sesión en
cookie `httpOnly` respaldada por Redis. Ver [`auth-minerva.md`](auth-minerva.md).

## Seguridad en SQL (datasets)

Defensa en capas (`backend/app/core/sql_guard.py` + `datasets/service.py`):

1. Parser SQL (`sqlglot`): un solo statement y raíz `SELECT`/`WITH ... SELECT`.
2. **Detección de escritura por AST**: se recorre el árbol y se rechaza cualquier
   nodo `INSERT/UPDATE/DELETE/MERGE/DROP/CREATE/ALTER/TRUNCATE/GRANT/COPY` o
   `Command` (VACUUM, SET ROLE, …). Cubre los CTE con escritura
   (`WITH x AS (INSERT…) SELECT …`) y `SELECT ... INTO`. A diferencia de una lista
   negra de keywords sobre texto crudo, **no** rechaza SELECT legítimos que usan
   columnas llamadas `owner`, `comment`, `update`, etc.
3. Blacklist acotada a **funciones peligrosas** (por patrón de llamada `func(`):
   `pg_read_file`, `pg_write_file`, `pg_execute_server_program`, `lo_import`,
   `lo_export`, `dblink`, …
4. Parámetros nombrados (`:param`) como bind variables; nunca concatenación.
5. Ejecución en transacción `READ ONLY` (`conn.read_only = True`, aplicada en
   **todas** las rutas de query externa) sobre un usuario PostgreSQL de solo
   lectura (ver abajo).
6. `statement_timeout` y límite máximo de filas (`max_rows`) por query.
7. Auditoría de ejecución (`query_execution_logs`): **pendiente**, se implementa
   con la fase de dashboards.

## Seguridad en conexiones

- Credenciales cifradas (Fernet, `SECRET_ENCRYPTION_KEY`); nunca en texto plano
  ni serializadas al frontend.
- **Usuario PostgreSQL de solo lectura por conexión (defensa en profundidad).**
  La transacción `READ ONLY` de la app impide escrituras aunque el rol tenga
  privilegios, pero el rol de la conexión **debe** provisionarse como solo
  lectura y sin acceso a tablas sensibles. Ejemplo de aprovisionamiento en la BD
  externa:

  ```sql
  CREATE ROLE tablerillos_ro LOGIN PASSWORD '...';
  GRANT CONNECT ON DATABASE indicadores TO tablerillos_ro;
  GRANT USAGE ON SCHEMA mart TO tablerillos_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA mart TO tablerillos_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA mart GRANT SELECT ON TABLES TO tablerillos_ro;
  ```

  El flag `Connection.read_only` documenta esa expectativa operativa; no otorga
  privilegios por sí mismo.
- **TLS estricto opcional**: `Connection.ssl_mode` fija el `sslmode` de psycopg
  por conexión (`verify-ca`/`verify-full` para validar el certificado del
  servidor). Si es NULL se deriva de `ssl_enabled` (`require`/`prefer`).

## API pública

- Solo dashboards publicados; sin SQL libre desde el cliente.
- Sanitización de Markdown (DOMPurify): sin scripts/iframes/`onclick`.
- Rate limiting, caché HTTP, CORS controlado.
