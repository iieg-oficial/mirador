# Desarrollo — Tablerillos

## Requisitos

- Docker + Docker Compose (plugin v2)
- (Local sin Docker) Python 3.12+ en el entorno conda `tab`, Node 22+, PostgreSQL 16 +
  PostGIS, Redis
- Una instancia de **Minerva** accesible (dev: `localhost:9000`)
- `GITHUB_TOKEN` (PAT con lectura al repo privado del `minerva-sdk`, dependencia base
  obligatoria)

## Arranque rápido (Docker)

Ver el procedimiento completo (variables de entorno, PAT, registro del manifest en
Minerva) en [`deployment.md`](deployment.md#desarrollo-local). Resumen:

```bash
cp .env.example .env
set -a && . ./.env && set +a
export GITHUB_TOKEN=ghp_...
docker compose -f infra/docker-compose.yml up --build
```

- Backend: http://localhost:8000 (health en `/health`, docs en `/docs`)
- Frontend: http://localhost:5173

## Backend sin Docker

```bash
cd backend
conda activate tab              # o: conda run -n tab <comando>
pip install -e ".[dev]"         # requiere GITHUB_TOKEN en el entorno
cp .env.example .env            # ajustar DATABASE_URL y REDIS_URL a localhost

alembic upgrade head
uvicorn app.main:app --reload
```

### Comandos frecuentes

```bash
conda run -n tab pytest                              # todos los tests
conda run -n tab pytest app/tests/test_x.py::test_y   # un solo test
conda run -n tab ruff check .                         # lint
conda run -n tab ruff format .                        # formato (line-length 100)
conda run -n tab mypy app                             # type check

conda run -n tab alembic upgrade head
conda run -n tab alembic revision --autogenerate -m "descripcion"
```

Los tests corren contra SQLite en memoria (`app/tests/conftest.py`) — no requieren
Postgres ni Redis reales. La auth se sustituye con `dependency_overrides` (único lugar
con mocks de auth). Las conexiones a BD externas se mockean con fakes de `psycopg`
(ver `test_run_query.py`); no hay tests de integración contra Postgres/Redis reales.

## Frontend sin Docker

```bash
cd frontend
npm install
npm run dev      # Vite en :5173, proxya /api a localhost:8000
```

```bash
npm run build    # tsc -b (type check estricto) && vite build — verificación principal
npm run lint     # eslint . --ext ts,tsx — el paquete eslint no está instalado todavía
npm run test     # vitest — sin specs aún (0 tests)
```

## Estructura de un módulo backend

Cada módulo implementado en `app/modules/<modulo>/` sigue el mismo patrón:
`models.py` (SQLModel), `schemas.py` (Pydantic para I/O), `service.py` (lógica de
negocio), `router.py` (endpoints FastAPI). El router se monta en `app/main.py` con
prefijo `/api/...` y, si es del panel admin, con `dependencies=[Depends(require_app_access)]`.

Al añadir un endpoint protegido, su permiso debe declararse en `manifest.minerva.yml`
(convención `tablerillos.{recurso}.{acción}`).

## CI

`.github/workflows/ci.yml` corre en cada push/PR: backend (ruff, mypy, pytest) y
frontend (build). Requiere el secret del repo `MINERVA_SDK_PAT` para instalar el
`minerva-sdk` privado.

## Producción

Ver [`deployment.md`](deployment.md#producción).

## Estado actual

Ver [`checklist.md`](checklist.md) para el detalle módulo por módulo.
