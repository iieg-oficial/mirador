# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

**Fase 0 — andamiaje.** El repo es actualmente un esqueleto: el backend solo expone
`/health`, el frontend muestra un placeholder, y los módulos (`backend/app/modules/*`,
`frontend/src/features/*`) son paquetes vacíos. Los módulos se implementan en fases
posteriores.

**En progreso — Fase 1 (Bloques A+B):** ya existe la infraestructura backend
(`app/core/config.py`, `database.py`, `security.py`, `app/shared/models.py`, Alembic) y la
**auth contra Minerva** (`app/modules/auth/`) sobre el `minerva-sdk` oficial, con el flujo
OIDC BFF completo (login/callback/logout) y gate de acceso por rol. El módulo de conexiones
(Bloque C) y el shell del frontend admin (Bloque E) están implementados.

La especificación de lo que se va a construir es autoritativa y vive en:
- **`tablerillos.md`** — manual técnico completo (módulos, modelo de datos, API,
  estados, decisiones de diseño). Es la fuente principal al implementar cualquier módulo.
- **`docs/`** — stubs por tema (`architecture`, `api`, `database`, `security`,
  `auth-minerva`, `development`) que resumen y se irán completando.
- **`integracion.md`** — contrato de integración con Minerva (el IdP externo).

Al implementar, **consulta el manual antes de inventar** estructuras, nombres de
permisos, estados o endpoints; ya están especificados.

## Comandos

Monorepo: `backend/` (FastAPI), `frontend/` (React+Vite), `infra/` (compose).

### Stack completo (Docker)
```bash
cp .env.example .env   # ajusta credenciales y datos de Minerva (incl. GITHUB_TOKEN)
# El minerva-sdk es OBLIGATORIO (dep base, repo privado): exporta el PAT al shell
# antes de construir — compose lo lee del entorno, no del .env.
set -a && . ./.env && set +a
docker compose -f infra/docker-compose.yml up --build
# backend :8000 (/health, /docs)  ·  frontend :5173
```

### Backend (Python 3.12+, ejecutar dentro de `backend/`)
Los comandos de Python corren en el entorno **conda `tab`** (`conda run -n tab <cmd>` o
`conda activate tab`).
```bash
conda run -n tab pip install -e ".[dev]"   # deps base (incluye minerva-sdk) + dev
conda run -n tab ruff check .              # lint
conda run -n tab ruff format .             # formato (line-length 100)
conda run -n tab mypy app                  # type check
conda run -n tab pytest                    # tests (testpaths=app/tests, asyncio_mode=auto)
conda run -n tab pytest app/tests/test_x.py::test_y   # un solo test
conda run -n tab alembic upgrade head      # migraciones
```

### Frontend (ejecutar dentro de `frontend/`)
```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint . --ext ts,tsx
npm run test     # vitest
```

## Arquitectura

### Cadena de datos (concepto central)
```
Connection → Dataset → Chart → Dashboard → DashboardVersion → DashboardPublication
```
Cada eslabón se separa para poder reutilizar: un dataset alimenta varias gráficas, una
gráfica entra en varios dashboards. **Los dashboards se guardan como configuración
(JSON), no como HTML.** La versión publicada es un **snapshot inmutable**; la API
pública sirve solo desde ese snapshot.

Estados del dashboard: `borrador → in_review → aprobado → publicado → archivado`
(ver el flujo de publicación en el manual).

### Autenticación: BFF contra Minerva (OBLIGATORIO, no hay identidad local)
- **Minerva es inamovible.** Es la única fuente de login, usuarios, roles y permisos —
  suple lo que todo sistema institucional debe tener. **No hay** proveedor alternativo,
  flag selector (`AUTH_PROVIDER`), ni modo "sin auth"/stub en el código de la app. Hay
  Minerva en producción, una de dev para pruebas, y opcionalmente una local; el sistema
  siempre habla con alguna.
- **Punto de entrada único:** los módulos importan SIEMPRE desde
  `app.modules.auth.deps` (`get_current_user`, `require_permission`, `require_app_access`),
  **nunca** desde `minerva_sdk` ni desde `auth/minerva.py`. `deps.py` delega en
  `auth/minerva.py`, que se monta sobre el **`minerva-sdk` oficial** (no se reimplementa
  criptografía ni el contrato de permisos).
- **No existen tablas `users`/`roles`/`permissions`.** Identidad y autorización viven en
  Minerva (OIDC, Authorization Code + PKCE). El SDK verifica la firma del access_token
  (RS256/JWKS) y consulta permisos en tiempo real (`GET /api/v1/me/permissions`, con
  caché); **nunca se comparan roles localmente**.
- **Gate de acceso por rol:** `require_app_access` exige que Minerva haya asignado al
  usuario ≥1 rol en `tablerillos` (claim `roles` del token). Sin rol → 403, antes de los
  permisos finos. Tener cuenta en Minerva no basta para entrar al panel.
- **minerva-sdk** es **dependencia base** (no extra), repo privado que requiere
  `GITHUB_TOKEN` (PAT). En Docker se pasa como secreto de BuildKit; si va vacío, el
  build **falla** (no es opcional). El `import minerva_sdk` es perezoso solo para poder
  importar la app en tests/CI sin el paquete.
- **Auth en tests:** se sustituye con `app.dependency_overrides` + un no-op de permisos
  en `app/tests/conftest.py`. Es el **único** lugar con mocks de auth.
- Modelo **BFF**: el backend FastAPI canjea el código y guarda los tokens server-side
  (sesión en Redis, cookie `httpOnly` `tb_session`). El navegador nunca ve tokens.
- `created_by` almacena el `sub` de Minerva (+ `created_by_email`). Tabla `user_profiles`
  opcional, espejo no autoritativo, solo para mostrar nombres.
- Los permisos/roles se declaran en **`manifest.minerva.yml`** (convención
  `tablerillos.{resource}.{action}`); ese archivo es la fuente. Si añades un endpoint
  protegido, su permiso debe existir ahí.
- **Dual-URL hacia Minerva** (corre en el host, fuera del compose): el navegador usa
  `MINERVA_PUBLIC_ISSUER_URL` (`localhost:9000`); el backend usa `MINERVA_ISSUER_URL`
  (`host.docker.internal:9000`). No los mezcles.
- **Rutas públicas** (`/api/public/*`) no llevan ningún dependency de Minerva: acceso sin
  login para los visitantes.

### Seguridad de SQL en datasets (defensa en capas)
Los datasets se crean desde SQL escrito por administradores. La validación irá en
`backend/app/core/sql_guard.py`:
1. Parser `sqlglot`: un solo statement, raíz `SELECT`/`WITH ... SELECT`.
2. Lista negra de keywords como red de seguridad.
3. Parámetros nombrados (`:param`), nunca concatenación.
4. Usuario PostgreSQL **read-only** por conexión + transacción `READ ONLY`.
5. `statement_timeout` y límite de filas.
6. Auditoría en `query_execution_logs`.

Credenciales de conexión cifradas con **Fernet** (`SECRET_ENCRYPTION_KEY`); nunca en
texto plano ni serializadas al frontend.

### Frontend
SPA React/TS con dos áreas: panel admin (`/admin`) y vistas públicas (`/`). En dev, Vite
proxya `/api` al backend para que la cookie de sesión BFF funcione sin CORS (ver
`frontend/vite.config.ts`). Organizado por feature en `src/features/*`. Stack clave:
TanStack Query (datos), Zustand (estado), React-Grid-Layout (canvas de dashboards),
**D3.js** (gráficas), DOMPurify (sanitización de Markdown público).

Las gráficas se renderizan con **D3.js** (no Plotly ni ECharts). Una gráfica se guarda
como especificación JSON independiente del renderer (`renderer: "d3"`, `chart_type`,
`field_mapping`, `visual_config`); D3 lee esa spec y construye el SVG. Para implementar
visualizaciones D3, usa el skill `d3js` (`.claude/skills/d3js/`), que documenta el patrón
de render (selección → scales → axes → `.join()`), tipos de gráfica, interactividad y
responsividad.

## Convenciones

- Toda la documentación, comentarios y nombres de cara al usuario están **en español**;
  mantén ese idioma.
- Tablas de metadata: `id: UUID`, `created_at`, `updated_at`. PostGIS disponible;
  geometría municipal es nullable/opcional en MVP1.
- Backend por módulos en `app/modules/<modulo>/`; los routers se montan en `app/main.py`
  con prefijo `/api/...` (ver el patrón comentado al final de ese archivo).
