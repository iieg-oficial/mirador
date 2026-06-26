# Seguridad — Tablerillos

> Stub inicial (Fase 0). Se amplía con la implementación.

## Autenticación / autorización

Delegada a Minerva (OIDC, modelo BFF). Tokens nunca en el navegador; sesión en
cookie `httpOnly` respaldada por Redis. Ver [`auth-minerva.md`](auth-minerva.md).

## Seguridad en SQL (datasets)

Defensa en capas (se implementa en `backend/app/core/sql_guard.py`):

1. Parser SQL (`sqlglot`): un solo statement y raíz `SELECT`/`WITH ... SELECT`.
2. Lista negra de keywords peligrosas como red de seguridad.
3. Parámetros nombrados (`:param`), nunca concatenación.
4. Usuario PostgreSQL **de solo lectura** por conexión + transacción `READ ONLY`.
5. `statement_timeout` y límite máximo de filas por query.
6. Auditoría de ejecución (`query_execution_logs`).

## Seguridad en conexiones

- Credenciales cifradas (Fernet, `SECRET_ENCRYPTION_KEY`); nunca en texto plano
  ni serializadas al frontend.
- Conexiones de solo lectura; no superadmin.

## API pública

- Solo dashboards publicados; sin SQL libre desde el cliente.
- Sanitización de Markdown (DOMPurify): sin scripts/iframes/`onclick`.
- Rate limiting, caché HTTP, CORS controlado.
