# API — Tablerillos

> Stub inicial (Fase 0). La especificación viva estará en `/docs` (Swagger UI)
> que expone FastAPI. Aquí se resume la superficie planeada.

## Auth (BFF / OIDC con Minerva)

```
GET  /api/auth/login        # inicia el flujo OIDC (redirección a Minerva)
GET  /api/auth/callback     # canje de código + creación de sesión
POST /api/auth/logout       # revoca en Minerva + destruye sesión
GET  /api/auth/me           # perfil del usuario autenticado
GET  /api/auth/permissions  # permisos del usuario (proxy a Minerva, para UI)
```

## Admin (protegidos con require_permission de Minerva)

- `/api/admin/connections` — CRUD + `POST .../test`
- `/api/admin/datasets` — CRUD + `validate`, `preview`, `execute`, `columns`
- `/api/admin/charts` — CRUD + `preview`
- `/api/admin/dashboards` — CRUD + `versions`, `submit-review`, `approve`, `publish`, `archive`
- `/api/exports` — crear/consultar/descargar jobs (placeholder MVP1)

## Público (sin auth)

- `/api/public/dashboards`, `/{slug}`, `/{slug}/data`, `POST /{slug}/query`
- `/api/public/municipios`, `/{slug}`, `/{slug}/dashboards`
