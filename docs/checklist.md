# Checklist v1.0 — Tablerillos

Estado de módulos. En julio 2026 el proyecto pivotó a **laboratorio de datos
interno**: la publicación pública (API pública, municipios, snapshot de
publicación) queda pospuesta hasta que se retome ese alcance.

---

## Infraestructura y base

- [x] **Monorepo** — estructura `backend/`, `frontend/`, `infra/`
- [x] **docker-compose** — postgres (PostGIS), redis, backend, frontend
- [x] **Dockerfile backend** — instalación del `minerva-sdk` privado vía BuildKit secret
- [x] **Migraciones automáticas** — `alembic upgrade head` al arrancar el backend
- [x] **Health check** — `GET /health` con componentes (metadata DB + Redis)
- [x] **Compose de producción** — `infra/docker-compose.prod.yml` (nginx + build estático + uvicorn multi-worker)
- [x] **Configuración centralizada** — `app/core/config.py` (pydantic-settings)
- [x] **Cifrado Fernet** — `app/core/security.py` para credenciales de conexión
- [x] **Base de modelos** — `UUIDAuditBase` con UUID, timestamps, autoría Minerva
- [x] **Agregador de modelos Alembic** — `app/models.py`
- [x] **Paleta de colores IIEG** — Tailwind config (morado institucional + naranja Jalisco)

---

## Autenticación (Módulo: auth)

- [x] **Flujo OIDC BFF** — login / callback / logout contra Minerva
- [x] **PKCE** — code_verifier y code_challenge en cada login
- [x] **Sesión Redis** — tokens server-side, cookie httpOnly `tb_session`
- [x] **Validación de firma** — RS256/JWKS via `minerva-sdk` (no reimplementado)
- [x] **Gate de rol** — `require_app_access`: sin rol en `tablerillos` → 403
- [x] **Permisos finos** — `require_permission` delega al SDK (tiempo real + caché)
- [x] **`GET /api/auth/me`** — perfil del usuario autenticado
- [x] **Manifiesto Minerva** — `manifest.minerva.yml` con permisos y roles declarados
- [x] **Tests de auth** — 11 tests sin Minerva real (`dependency_overrides`)
- [x] **Frontend — AuthGuard** — redirige a Minerva si no hay sesión
- [x] **Frontend — AccessDenied** — página para usuarios sin rol en Tablerillos
- [x] **Frontend — useAuth** — hook con `user`, `isLoading`, `hasAccess`

---

## Conexiones a bases de datos (Módulo: connections)

- [x] **CRUD** — crear, leer, actualizar, archivar conexiones
- [x] **Cifrado de contraseña** — Fernet al guardar, descifrado solo en el backend
- [x] **Prueba de conexión** — `POST /{id}/test` con timeout, solo lectura, `SELECT 1`
- [x] **Explorador de esquema** — tablas, vistas y vistas materializadas por esquema
- [x] **Columnas bajo demanda** — `GET /{id}/schema/{schema}/{obj}/columns`
- [x] **Migración Alembic** — `0001_initial_connections.py`
- [x] **Tests de conexiones** — 7 tests (CRUD, cifrado, archivado, prueba)
- [x] **Frontend — lista con semáforo** — gris/verde/rojo/amarillo pulsante
- [x] **Frontend — formulario** — crear/editar en modal con validación
- [x] **Frontend — explorador de esquema** — árbol lazy con columnas por demanda
- [x] **Frontend — confirmación de borrado** — confirmación inline en la tarjeta

---

## Datasets (Módulo: datasets)

- [x] Modelo de datos (`Dataset` con estados y JSONB para esquemas)
- [x] Migración Alembic — `0002_datasets.py`
- [x] `sql_guard.py` — validación SELECT-only (sqlglot + blacklist)
- [x] CRUD de datasets (baja lógica → archived)
- [x] Validar query SQL antes de guardar (`validate_sql` en create + update)
- [x] `POST /{id}/validate` — valida SQL contra la BD real, infiere columnas y parámetros
- [x] `POST /{id}/preview` — ejecución del dataset guardado con max_rows
- [x] `POST /playground` — ejecución ad-hoc sin guardar dataset
- [x] Ejecución parametrizada (`:param` → bind variables psycopg)
- [x] Total de registros en cada ejecución (`SELECT COUNT(*) FROM (<query>)`)
- [x] Límite de filas por ejecución (`max_rows`, configurable por dataset)
- [x] Transacción READ ONLY + statement_timeout en toda ejecución
- [x] Frontend — playground SQL con selector de conexión y max_rows
- [x] Frontend — tabla de resultados con estadísticas (total/columnas/ms)
- [x] Frontend — formulario modal para guardar como dataset
- [x] Frontend — lista de datasets guardados con acciones (validar, editar, archivar)
- [x] **Documentación** — `docs/modules/datasets.md`
- [x] Tests de sql_guard y ejecución (`test_sql_guard.py`, `test_run_query.py`, `test_datasets_api.py`, `test_datasets_service.py`)
- [x] 503 claro cuando la BD externa no está disponible
- [ ] `query_execution_logs` — auditoría de cada ejecución (pendiente)

---

## Gráficas (Módulo: charts)

Ver `docs/modules/charts.md`.

- [x] Modelo de datos (`Chart` con ChartSpec 1.0 JSONB + `ChartVersion`)
- [x] Migraciones Alembic
- [x] CRUD, validación, preview por spec (con caché), clonado, estados
- [x] ChartSpec 1.0 (spec canónica independiente del renderer) + query builder seguro
- [x] Versionado con restauración
- [x] Overrides controlados (legend/tooltip/grid) y temas ECharts (paleta IIEG)
- [x] Tests backend (`test_chart_spec.py`, `test_chart_query_builder.py`, `test_charts.py`, `test_chart_versions.py`)
- [x] Frontend — builder visual drag-and-drop + editor JSON (CodeMirror)
- [x] Frontend — render ECharts (9 tipos; table/kpi como componentes React)
- [x] Frontend — previsualización, historial, descarga PNG (toolbox)

---

## Dashboards (Módulo: dashboards)

Ver `docs/modules/dashboards.md` (dashboards internos exploratorios).

- [x] Modelo de datos y migración (`0008_dashboards.py`)
- [x] CRUD de dashboards + tests
- [x] Frontend — canvas con React Grid Layout (drag & drop de gráficas)
- [x] Frontend — widgets de texto, filtros globales y locales
- [ ] Flujo de publicación (submit-review/approve/publish) — pospuesto (lab interno)
- [ ] `DashboardVersion` — snapshot JSON inmutable — pospuesto (lab interno)

---

## API pública (Módulo: public)

- [ ] `GET /api/public/dashboards` — lista de dashboards publicados
- [ ] `GET /api/public/dashboards/{slug}` — dashboard publicado (snapshot)
- [ ] `POST /api/public/dashboards/{slug}/query` — ejecuta dataset con filtros
- [ ] `GET /api/public/municipios` — catálogo de municipios
- [ ] `GET /api/public/municipios/{slug}/dashboards` — tableros de un municipio
- [ ] Sin autenticación en ninguna ruta pública
- [ ] Rate limiting en rutas públicas
- [ ] Caché HTTP (`Cache-Control`, ETag)
- [ ] Frontend — página pública de dashboard
- [ ] Frontend — navegación por municipio

---

## Municipios (Módulo: municipios)

- [ ] Catálogo de municipios de Jalisco (tabla con datos básicos)
- [ ] Geometría municipal (PostGIS, nullable en MVP)
- [ ] Seed inicial con los 125 municipios
- [ ] Migración Alembic

---

## Exportación

- [x] Exportar gráfica como PNG (toolbox saveAsImage de ECharts, gateado por `interactions.download`)
- [x] Descargar CSV desde previews de datasets y gráficas (client-side, filas ya capadas a max_rows)
- [ ] Exportar dashboard completo como PDF (Playwright headless) — pospuesto
- [ ] Sistema de jobs asíncronos (cola + worker) — pospuesto

---

## Auditoría (Módulo: audit)

- [ ] `query_execution_logs` — tabla de log de ejecuciones de datasets
- [ ] Registro de: usuario, conexión, dataset, duración, filas devueltas, error
- [ ] `GET /api/admin/audit/queries` (permiso `audit.view`)

---

## Documentación y operaciones

- [x] `CLAUDE.md` — guía para el asistente de código
- [x] `docs/architecture.md` — arquitectura global
- [x] `docs/deployment.md` — guía de despliegue dev/prod
- [x] `docs/modules/auth.md` — documentación del módulo auth
- [x] `docs/modules/connections.md` — documentación del módulo connections
- [x] `integracion.md` — contrato de integración con Minerva
- [x] `manifest.minerva.yml` — permisos y roles declarados
- [x] `docs/modules/datasets.md`
- [x] `docs/modules/charts.md`
- [x] `docs/modules/dashboards.md`
- [x] Guía de despliegue productivo (compose prod, nginx, TLS aguas arriba, respaldos)
- [ ] `docs/modules/public.md` — pospuesto (lab interno)
- [ ] Documentación de API pública (endpoints y contratos) — pospuesto
- [x] CI (GitHub Actions: ruff + mypy + pytest, build del frontend)
- [ ] Runbook de rotación de `SECRET_ENCRYPTION_KEY`
