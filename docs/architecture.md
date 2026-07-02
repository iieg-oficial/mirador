# Arquitectura Global — Tablerillos

## Visión general

Tablerillos es el **laboratorio de datos interno** del IIEG. Permite a analistas crear
datasets desde SQL contra el data warehouse institucional, construir gráficas (ChartSpec
1.0 sobre Apache ECharts) y acomodarlas en tableros interactivos, para explorar y definir
a futuro qué productos de datos conviene publicar. La publicación pública sin
autenticación (API pública, snapshot inmutable de dashboards) es un objetivo pospuesto,
no una funcionalidad actual — ver `docs/checklist.md`.

El sistema es un **monorepo** con tres piezas:

```
Tablerillos/
├── backend/    FastAPI (Python 3.12+) — API REST + BFF de autenticación
├── frontend/   React + TypeScript + Vite — SPA (admin + público)
└── infra/      docker-compose, scripts
```

---

## Cadena de datos (concepto central)

```
Connection → Dataset → Chart → Dashboard → [DashboardVersion → DashboardPublication]
```

Cada eslabón se separa para permitir reutilización:
- Un **Dataset** puede alimentar varias **Chart**s.
- Una **Chart** puede aparecer en varios **Dashboard**s.
- Un **Dashboard** se guarda como configuración JSON (no como HTML renderizado).

Los dos últimos eslabones (versión inmutable + publicación) son el diseño **objetivo**
para cuando se retome la publicación pública. El módulo de tableros internos que
implementaba `Dashboard` se **retiró en 0.1.1** (bugs y alcance sin pulir); `Dashboard`
permanece solo como eslabón de diseño futuro, sin implementación hoy.

---

## Stack tecnológico

### Backend

| Pieza | Tecnología |
|---|---|
| Framework | FastAPI 0.115+ |
| ORM / modelos | SQLModel (sobre SQLAlchemy) |
| Migraciones | Alembic |
| Base de datos principal | PostgreSQL 16 + PostGIS 3.4 |
| Caché / sesiones | Redis 7 |
| Cifrado de credenciales | Cryptography (Fernet) |
| Parser SQL | sqlglot |
| HTTP cliente | httpx |
| Tests | pytest + pytest-asyncio |
| Lint / formato | ruff (line-length 100) |
| Tipos | mypy |

### Frontend

| Pieza | Tecnología |
|---|---|
| Framework | React 18 + TypeScript 5 |
| Bundler | Vite 6 |
| Estado servidor | TanStack Query v5 |
| Estado local | Zustand |
| Routing | React Router v6 |
| Formularios | React Hook Form |
| Estilos | Tailwind CSS 3 |
| Canvas de dashboards | React Grid Layout |
| Gráficas | Apache ECharts 5 |
| Sanitización MD | DOMPurify (instalado, sin uso aún — reservado para Markdown público) |

---

## Componentes de infraestructura (desarrollo)

```
┌─────────────────────────────────────────────────────┐
│  Host del desarrollador                              │
│                                                      │
│  ┌──────────┐    ┌──────────────────────────────┐   │
│  │ Minerva  │    │   docker-compose (tablerillos)│   │
│  │ :9000    │    │                              │   │
│  │ (IdP)    │    │  frontend :5173 (Vite dev)    │   │
│  └────┬─────┘    │  backend  :8000 (--reload)    │   │
│       │          │  postgres  :5432             │   │
│       │          │  redis     :6380             │   │
│       │          └──────────────────────────────┘   │
└───────┼─────────────────────────────────────────────┘
        │
        └── Minerva corre en el host, fuera del compose.
            Los contenedores lo alcanzan via host.docker.internal.
            El navegador lo alcanza via localhost:9000.
```

El backend tiene `extra_hosts: host.docker.internal:host-gateway` para poder hablar con Minerva desde dentro del contenedor en Linux.

## Componentes de infraestructura (producción)

`infra/docker-compose.prod.yml` — único puerto expuesto (`HTTP_PORT`, default 8080); ver
`docs/deployment.md` para el procedimiento completo.

```
proxy institucional (TLS) ──► nginx :HTTP_PORT ──► estáticos del SPA (build de Vite)
                                   └── /api ────► backend :8000 (uvicorn, 4 workers,
                                                     sin --reload, --proxy-headers)
                                                     └── postgres / redis (red interna,
                                                         sin puertos publicados)
```

nginx sirve el build estático del frontend y hace proxy de `/api` al backend
(`frontend/Dockerfile`, target `prod`, imagen `nginx:alpine`) — el navegador y la API
quedan **same-origin**, así que la cookie BFF `tb_session` funciona sin CORS. TLS lo
termina el proxy institucional aguas arriba; nginx recibe HTTP plano y reenvía
`X-Forwarded-Proto` al backend.

---

## Autenticación — modelo BFF

Tablerillos implementa el patrón **Backend-For-Frontend (BFF)**: el backend es el único que habla con Minerva; el navegador nunca ve tokens.

```
Navegador                Backend Tablerillos          Minerva (IdP)
    │                          │                           │
    │─── GET /api/auth/login ──►│                           │
    │                          │── redirige a Minerva ─────►│
    │◄──────────────────────────────────────────── redirect │
    │─── GET /api/auth/callback?code=... ──────────────────►│
    │                          │◄── access_token + refresh ─│
    │                          │ (guarda en Redis)          │
    │◄── Set-Cookie: tb_session (httpOnly) ─────────────────│
    │                          │                           │
    │─── GET /api/... ─────────►│                           │
    │   (con cookie tb_session) │── valida token con SDK ──►│
    │                          │◄── claims + permisos ──────│
    │◄── respuesta ─────────────│                           │
```

**Flujo OIDC Authorization Code + PKCE:**
1. `/login` genera `code_verifier` + `state` + `nonce`, los guarda en Redis (`oidc:{state}`, TTL 300s) y redirige al navegador a Minerva.
2. `/callback` recibe el código, canjea con Minerva server-to-server, guarda `{access_token, refresh_token}` en Redis (`session:{sid}`, TTL 24h) y setea la cookie `tb_session` (httpOnly, SameSite=lax, Secure en producción).
3. Cada request protegido: el backend lee el `sid` de la cookie, recupera el `access_token` de Redis, y lo pasa al `minerva-sdk` para validar firma (RS256/JWKS) y consultar permisos en tiempo real.

**Gate de acceso por rol:** `require_app_access` exige que el token contenga al menos un rol de `tablerillos` (claim `roles`). Tener cuenta en Minerva no es suficiente para entrar al panel.

---

## Seguridad en datasets (defensa en capas)

Las queries de usuario contra las BDs externas pasan por múltiples capas
(`app/core/sql_guard.py` + `datasets/service.py`), detalladas en `docs/security.md`:

1. **Parser sqlglot** — un solo statement, raíz `SELECT` / `WITH … SELECT` (rechazo por AST).
2. **Blacklist de funciones peligrosas** (`pg_read_file`, `dblink`, …) como red secundaria.
3. **Parámetros nombrados** (`:param`), nunca concatenación de strings.
4. **Usuario PostgreSQL de solo lectura** + transacción `READ ONLY`.
5. **`statement_timeout`** y límite máximo de filas por ejecución.
6. **Auditoría** de cada ejecución en `query_execution_logs` — **pendiente** (fuera del
   ciclo de producción de 2026-07 por decisión del usuario).

Además, si la BD externa no responde, el backend distingue eso de un error de consulta y
devuelve **503** (no 502/500) — ver "Resiliencia" en `CLAUDE.md`.

---

## Módulos backend

```
app/
├── core/
│   ├── config.py        Settings (pydantic-settings) — única fuente de env vars
│   ├── database.py      Engine SQLAlchemy + dependency get_session()
│   ├── security.py      encrypt_secret / decrypt_secret (Fernet)
│   ├── sql_guard.py     validate_sql / normalize_sql — defensa en capas (ver security.md)
│   ├── db_external.py   make_conninfo — arma la cadena psycopg de una Connection
│   └── cache.py         get_cached/set_cached/invalidate — caché Redis tolerante a fallos
├── shared/
│   └── models.py        UUIDAuditBase — base de todas las tablas
├── models.py            Agregador de modelos (para Alembic autogenerate)
└── modules/
    ├── auth/            OIDC BFF + gate de roles + deps de FastAPI — implementado
    ├── connections/     CRUD de conexiones + test + explorador de esquema — implementado
    ├── datasets/        SQL guard, playground, preview — implementado
    ├── charts/          ChartSpec 1.0, query builder, versionado — implementado
    ├── filters/         (placeholder vacío — la lógica de filtros vive en charts.spec,
    │                     no como módulo propio)
    ├── public/          (placeholder vacío — pospuesto)
    ├── municipios/      (placeholder vacío — pospuesto)
    ├── audit/           (placeholder vacío — pospuesto, ver docs/checklist.md)
    └── exports/         (placeholder vacío — la exportación CSV/PNG implementada es
                          100% client-side, no requirió backend; ver docs/modules/charts.md)
```

Cada módulo implementado tiene la estructura: `models.py`, `schemas.py`, `service.py`,
`router.py`. Los routers se montan en `app/main.py` con prefijo `/api/...`.

---

## Frontend — estructura

```
src/
├── app/
│   ├── router.tsx       Árbol de rutas (React Router)
│   └── providers.tsx    QueryClient
├── features/
│   ├── admin/           Layout del panel admin (sidebar, nav)
│   ├── auth/            AuthGuard, AccessDenied, useAuth
│   ├── connections/     Página, formulario y explorador de esquema
│   ├── datasets/        Playground SQL inline + lista de datasets guardados
│   ├── charts/          Builder visual, editor JSON (CodeMirror), ChartRenderer (ECharts), temas
│   └── public/          Landing pública (`/`) — sin dashboards publicados aún
├── lib/
│   └── csv.ts           downloadCsv — exportación CSV client-side (RFC 4180 + BOM)
└── types/
    ├── auth.ts, connections.ts, datasets.ts, charts.ts
```

**Dos áreas:**
- `/admin/*` — panel de administración, protegido por `AuthGuard`. Es donde vive todo el
  laboratorio de datos (conexiones, datasets, gráficas).
- `/*` — landing pública, sin autenticación. Sin publicación de dashboards todavía
  (pospuesto).

El proxy de Vite (`/api → backend:8000`) permite que la cookie de sesión funcione en
desarrollo sin CORS; en producción esto lo resuelve el nginx del stack (same-origin, sin
proxy de Vite).

---

## Base de datos (PostgreSQL)

Tablerillos tiene **una sola base de datos propia** para metadata (conexiones, datasets, gráficas, dashboards, etc.). Las bases de datos registradas como `Connection` son **externas** — el sistema se conecta a ellas solo para ejecutar queries SELECT.

Convención de tablas:
- `id: UUID` (PK)
- `created_at`, `updated_at` (datetime UTC)
- `created_by` (sub de Minerva), `created_by_email`

PostGIS está disponible en el motor pero sin uso actual: los mapas geográficos quedaron
fuera de alcance (los cubre otro proyecto) y el catálogo de municipios está pospuesto.

Migraciones con Alembic — se corren automáticamente al arrancar el backend (`alembic upgrade head` antes de `uvicorn`).
