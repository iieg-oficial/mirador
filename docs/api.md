# API — Tablerillos

Índice de endpoints. La especificación viva (OpenAPI/Swagger) la expone el propio
backend en `/docs`. El detalle de cada módulo (payloads, permisos, reglas de negocio)
vive en `docs/modules/*.md`.

## Meta

```
GET  /health   # componentes: {"status", "components": {"database", "redis"}} — 503 si algo falla
```

## Auth (BFF / OIDC con Minerva) — sin gate de rol, ver docs/modules/auth.md

```
GET  /api/auth/login       # inicia el flujo OIDC (redirección a Minerva)
GET  /api/auth/callback    # canje de código + creación de sesión
POST /api/auth/logout      # revoca en Minerva + destruye sesión
GET  /api/auth/me          # perfil del usuario autenticado (CurrentUser)
```

## Admin (`/api/admin/*`)

Todos requieren `require_app_access` (≥1 rol en `tablerillos`) + el permiso fino de cada
endpoint (`tablerillos.{recurso}.{acción}`, declarados en `manifest.minerva.yml`).

**Connections** — `docs/modules/connections.md`
```
GET/POST      /api/admin/connections
GET/PUT/DELETE /api/admin/connections/{id}          # DELETE archiva (baja lógica)
POST          /api/admin/connections/{id}/test
GET           /api/admin/connections/{id}/schema
GET           /api/admin/connections/{id}/schema/{schema}/{objeto}/columns
```

**Datasets** — `docs/modules/datasets.md`
```
GET/POST       /api/admin/datasets
GET/PUT/DELETE /api/admin/datasets/{id}              # DELETE archiva
POST           /api/admin/datasets/{id}/validate     # LIMIT 0 + infiere columnas
POST           /api/admin/datasets/{id}/preview      # ejecuta el dataset guardado
POST           /api/admin/datasets/playground        # ejecución ad-hoc sin guardar
```

**Charts** — `docs/modules/charts.md`
```
GET/POST       /api/admin/charts
GET/PUT/DELETE /api/admin/charts/{id}                # DELETE archiva
POST           /api/admin/charts/validate            # valida una ChartSpec sin guardar
POST           /api/admin/charts/preview             # ejecuta una spec sin guardar
POST           /api/admin/charts/{id}/preview        # ejecuta la spec guardada
POST           /api/admin/charts/{id}/clone
GET            /api/admin/charts/{id}/versions
POST           /api/admin/charts/{id}/restore/{version_id}
```

**Dashboards** — `docs/modules/dashboards.md`
```
GET/POST       /api/admin/dashboards
GET/PUT/DELETE /api/admin/dashboards/{id}            # DELETE archiva
PUT            /api/admin/dashboards/{id}/items      # reemplazo en bloque del layout
```

## Errores comunes

- `422` — validación de payload o de la ChartSpec/SQL (`sql_guard`).
- `404` — recurso no encontrado.
- `409` — slug de dataset duplicado.
- `502` — la consulta contra la BD externa falló (SQL inválido, timeout de statement).
- `503` — la BD externa o Redis no están disponibles (infraestructura caída, no error
  del usuario); ver "Resiliencia" en `CLAUDE.md`.

## Pospuesto

Publicación de dashboards (`/api/admin/dashboards/{id}/submit-review|approve|publish`),
API pública (`/api/public/*`: dashboards, municipios), exportación asíncrona
(`/api/exports/*`) y auditoría (`/api/admin/audit/*`) — ver `docs/checklist.md`. La
exportación PNG/CSV actual es 100% client-side y no tiene endpoints propios.
