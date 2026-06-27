# Arquitectura Global — Tablerillos

## Visión general

Tablerillos es un sistema de Business Intelligence institucional del IIEG. Permite a administradores crear datasets desde SQL, construir gráficas y dashboards interactivos, y publicarlos para consulta pública sin autenticación.

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
Connection → Dataset → Chart → Dashboard → DashboardVersion → DashboardPublication
```

Cada eslabón se separa para permitir reutilización:
- Un **Dataset** puede alimentar varias **Chart**s.
- Una **Chart** puede aparecer en varios **Dashboard**s.
- Un **Dashboard** se guarda como configuración JSON (no como HTML renderizado).
- Al publicar se crea un **DashboardVersion** que es un snapshot **inmutable** — la API pública sirve solo desde ese snapshot.

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
| Sanitización MD | DOMPurify |

---

## Componentes de infraestructura

```
┌─────────────────────────────────────────────────────┐
│  Host del desarrollador / servidor                   │
│                                                      │
│  ┌──────────┐    ┌──────────────────────────────┐   │
│  │ Minerva  │    │   docker-compose (tablerillos)│   │
│  │ :9000    │    │                              │   │
│  │ (IdP)    │    │  frontend :5173              │   │
│  └────┬─────┘    │  backend  :8000              │   │
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

Las queries de usuario contra las BDs externas pasan por múltiples capas (a implementar en `app/core/sql_guard.py`):

1. **Parser sqlglot** — un solo statement, raíz `SELECT` / `WITH … SELECT`.
2. **Lista negra** de keywords peligrosos como red de seguridad secundaria.
3. **Parámetros nombrados** (`:param`), nunca concatenación de strings.
4. **Usuario PostgreSQL de solo lectura** + transacción `READ ONLY`.
5. **`statement_timeout`** y límite máximo de filas por ejecución.
6. **Auditoría** de cada ejecución en `query_execution_logs`.

---

## Módulos backend

```
app/
├── core/
│   ├── config.py        Settings (pydantic-settings) — única fuente de env vars
│   ├── database.py      Engine SQLAlchemy + dependency get_session()
│   └── security.py      encrypt_secret / decrypt_secret (Fernet)
├── shared/
│   └── models.py        UUIDAuditBase — base de todas las tablas
├── models.py            Agregador de modelos (para Alembic autogenerate)
└── modules/
    ├── auth/            OIDC BFF + gate de roles + deps de FastAPI
    ├── connections/     CRUD de conexiones + test + explorador de esquema
    ├── datasets/        (pendiente)
    ├── charts/          (pendiente)
    ├── dashboards/      (pendiente)
    ├── filters/         (pendiente)
    ├── public/          (pendiente)
    ├── municipios/      (pendiente)
    ├── audit/           (pendiente)
    └── workers/         (pendiente)
```

Cada módulo tiene la estructura: `models.py`, `schemas.py`, `service.py`, `router.py`.

Los routers se montan en `app/main.py` con prefijo `/api/...`.

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
│   ├── public/          Homepage pública
│   ├── charts/          (pendiente)
│   ├── datasets/        (pendiente)
│   └── dashboards/      (pendiente)
└── types/
    ├── auth.ts
    └── connections.ts
```

**Dos áreas:**
- `/admin/*` — panel de administración, protegido por `AuthGuard`.
- `/*` — vistas públicas, sin autenticación.

El proxy de Vite (`/api → backend:8000`) permite que la cookie de sesión funcione en desarrollo sin CORS.

---

## Base de datos (PostgreSQL)

Tablerillos tiene **una sola base de datos propia** para metadata (conexiones, datasets, gráficas, dashboards, etc.). Las bases de datos registradas como `Connection` son **externas** — el sistema se conecta a ellas solo para ejecutar queries SELECT.

Convención de tablas:
- `id: UUID` (PK)
- `created_at`, `updated_at` (datetime UTC)
- `created_by` (sub de Minerva), `created_by_email`

PostGIS está disponible para la capa de municipios (geometría, mapas coropléticos).

Migraciones con Alembic — se corren automáticamente al arrancar el backend (`alembic upgrade head` antes de `uvicorn`).
