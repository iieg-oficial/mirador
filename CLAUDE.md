# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

**Implementado:**
- Infraestructura base (compose, Dockerfile, Alembic, health check)
- Auth contra Minerva (OIDC BFF completo, gate de rol, `minerva-sdk`)
- Conexiones a BD (CRUD, prueba, explorador de esquema + UI completa)
- Shell del frontend admin (layout, routing, AuthGuard, AccessDenied)
- Datasets (SQL crudo validado con `sql_guard`, columnas con metadata semántica,
  preview/playground, caché Redis)
- Gráficas como **ChartSpec 1.0** (spec JSON versionada e independiente del
  renderer): constructor visual drag-and-drop, editor avanzado JSON (CodeMirror),
  generación segura de consultas desde la spec (agregación server-side),
  validación/preview, versionado con restauración, clonado, estados. 9 tipos:
  line/bar/pie/scatter/candlestick/boxplot/treemap + table/kpi (estos dos como
  componentes React, no ECharts). Ver `docs/modules/charts.md`.
- Exportación: descarga CSV (client-side, desde las filas ya cargadas en preview) y PNG
  de gráficas (toolbox `saveAsImage` de ECharts, gateado por `interactions.download`).
- Producción: `infra/docker-compose.prod.yml` (nginx como único punto de entrada +
  proxy `/api`, build estático del frontend, backend multi-worker), CI en GitHub
  Actions (`.github/workflows/ci.yml`). Ver `docs/deployment.md`.
- Resiliencia: BD externa o Redis caídos responden 503 con mensaje claro (no 500/502
  genérico); `/health` reporta el estado de la BD de metadata y de Redis por separado.
- Tableros/dashboards internos (backend `app/modules/dashboards/` + frontend
  `features/dashboards/`): grid drag-and-drop de gráficas/Markdown, filtros
  globales/locales, exportación PDF/ZIP. Se había retirado en 0.1.1 por bugs y alcance
  sin pulir; está de vuelta en desarrollo activo.

**Pendiente:** publicación de dashboards (snapshot inmutable), API pública, municipios,
auditoría (`query_execution_logs` — el usuario decidió dejarla fuera del ciclo de
producción de 2026-07). **Mapas geográficos: descartados** (los cubre otro proyecto).

La especificación de lo que se va a construir es autoritativa y vive en:
- **`docs/`** — arquitectura, despliegue, documentación por módulo, checklist v1.0.
  (Los manuales originales `tablerillos.md`/`integracion.md` se migraron aquí y ya no
  existen como archivos sueltos.)
- **`manifest.minerva.yml`** — permisos y roles declarados a Minerva.

Al implementar, **consulta `docs/` antes de inventar** estructuras, nombres de
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

Producción usa `infra/docker-compose.prod.yml` (nginx único punto de entrada, build
estático del frontend, backend multi-worker sin reload); ver `docs/deployment.md`.

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
npm run build    # tsc -b && vite build (type-check estricto; verificación principal)
npm run lint     # eslint . --ext ts,tsx — el paquete eslint NO está instalado aún
                 # (gap conocido); `npm run build` es la verificación real hoy
npm run test     # vitest — sin tests todavía (0 specs); no forma parte de CI
```

## Arquitectura

### Cadena de datos (concepto central)
```
Connection → Dataset → Chart → Dashboard → [DashboardVersion → DashboardPublication]
```
Cada eslabón se separa para poder reutilizar: un dataset alimenta varias gráficas, una
gráfica entra en varios dashboards. **Los dashboards se guardan como configuración
(JSON), no como HTML.** Los dos últimos eslabones (versión inmutable + publicación) son
el **objetivo a futuro** cuando se retome la publicación pública; el módulo de tableros
internos (`Dashboard` sin versión/publicación) se había retirado en 0.1.1 y está de
vuelta en desarrollo activo (ver "Estado del proyecto" arriba). El flujo de estados
`borrador → in_review → aprobado → publicado → archivado` documentado en
`docs/checklist.md` sigue siendo el diseño planeado para cuando exista publicación, no
lo implementado hoy.

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
- **Rutas públicas** (`/api/public/*`): diseño objetivo para cuando se retome la
  publicación (sin ningún dependency de Minerva, acceso sin login). El módulo
  `app/modules/public/` es hoy un placeholder vacío — no existe todavía.

### Seguridad de SQL en datasets (defensa en capas)
Los datasets se crean desde SQL escrito por administradores. La validación vive en
`backend/app/core/sql_guard.py`:
1. Parser `sqlglot`: un solo statement, raíz `SELECT`/`WITH ... SELECT` (rechazo por AST,
   no por regex sobre texto: no falsos positivos con columnas llamadas `update`, etc.).
2. Blacklist acotada a funciones peligrosas (`pg_read_file`, `dblink`, …) como red
   secundaria.
3. Parámetros nombrados (`:param`), nunca concatenación.
4. Usuario PostgreSQL **read-only** por conexión + transacción `READ ONLY`.
5. `statement_timeout` y límite de filas.
6. Auditoría en `query_execution_logs`: **pendiente** (decisión del usuario de dejarla
   fuera del ciclo de producción de 2026-07; ver `docs/checklist.md`).

Credenciales de conexión cifradas con **Fernet** (`SECRET_ENCRYPTION_KEY`); nunca en
texto plano ni serializadas al frontend.

### Resiliencia ante dependencias caídas
Si la BD externa de una `Connection` o Redis no están disponibles, el sistema responde
**503 con mensaje claro**, no un 500/502 genérico:
- `datasets/service.py`: el `connect()` a la BD externa pasa por un único punto
  (`_connect`) que traduce `psycopg.OperationalError` a 503. Cubre preview, playground,
  validación y las gráficas (que reusan `run_query`).
- `auth/session.py`: `SessionStore` captura `RedisError` en `get/set/delete` → 503.
- `GET /health` reporta el estado de la BD de metadata y de Redis por separado
  (`{"components": {"database", "redis"}}`), 503 si alguno falla.

Si agregas un nuevo punto de acceso a una BD externa o a Redis, sigue este mismo patrón
(un punto único de conexión que traduce el error de infraestructura a 503) en vez de
dejar que burbujee al handler global de excepciones.

### Frontend
SPA React/TS con dos áreas: panel admin (`/admin`, donde vive todo el laboratorio de
datos) y una landing pública (`/`, sin dashboards publicados todavía). En dev, Vite
proxya `/api` al backend para que la cookie de sesión BFF funcione sin CORS (ver
`frontend/vite.config.ts`); en producción esto lo resuelve el nginx del stack
(same-origin, sin proxy de Vite). Organizado por feature en `src/features/*`. Stack
clave: TanStack Query (datos), Zustand (estado), **Apache ECharts 5** (gráficas).
`dompurify` está instalado mirando a la
sanitización de Markdown público, pero **no se usa todavía** (no hay contenido Markdown
público que sanitizar hasta que se retome la publicación).

Las gráficas se guardan como **ChartSpec 1.0**, una spec JSON versionada e independiente
del renderer (`version/data/visual/encodings/interactions/style/overrides` — ver
`docs/modules/charts.md`, NO `field_mapping`/`visual_config`, terminología de un diseño
anterior ya reemplazado). El componente `ChartRenderer.tsx` transforma esa spec en una
opción de **Apache ECharts** (`echarts` v5) y la monta vía `echarts.init()`; ECharts
incluye sus propios tipos TypeScript, no se necesita `@types/echarts`.

## Convenciones

- Toda la documentación, comentarios y nombres de cara al usuario están **en español**;
  mantén ese idioma.
- Tablas de metadata: `id: UUID`, `created_at`, `updated_at`. PostGIS disponible;
  geometría municipal es nullable/opcional en MVP1.
- Backend por módulos en `app/modules/<modulo>/`; los routers se montan en `app/main.py`
  con prefijo `/api/...` (ver el patrón comentado al final de ese archivo).
