# Tablerillos

**Laboratorio de datos interno del IIEG.** Permite a los analistas explorar bases de
datos del data warehouse institucional, construir gráficas (ChartSpec 1.0 sobre Apache
ECharts) y acomodarlas en tableros interactivos, para definir a futuro qué productos de
datos merece la pena publicar. Evoluciona los antiguos *Cuadernillos Municipales*
(reportes estadísticos por municipio de Jalisco).

La autenticación y la gestión de usuarios/roles/permisos se delegan por completo a
**Minerva** (el IdP institucional del IIEG) vía OIDC. Ver
[`docs/auth-minerva.md`](docs/auth-minerva.md).

> El proyecto pivotó de "tableros públicos" a laboratorio interno: no hay vistas
> públicas ni publicación de dashboards en esta fase (ver `docs/checklist.md`). Mapas
> geográficos quedaron fuera de alcance (los cubre otro proyecto).

## Stack

- **Backend**: FastAPI · SQLModel · Alembic · PostgreSQL/PostGIS · Redis · Python 3.12+
- **Frontend**: React · TypeScript · Vite · TanStack Query · Zustand · React Router ·
  Tailwind · React-Grid-Layout · Apache ECharts 5
- **Infra**: Docker · docker-compose (dev y producción) · nginx · GitHub Actions (CI)

## Estructura del monorepo

```text
tablerillos/
├── backend/      # API FastAPI + BFF de auth (Minerva)
├── frontend/     # SPA React/TS/Vite (panel admin)
├── infra/        # docker-compose (dev y prod), nginx, scripts
├── docs/         # arquitectura, api, base de datos, seguridad, despliegue, módulos
├── manifest.minerva.yml   # permisos y roles declarados a Minerva
└── README.md
```

## Arranque rápido (desarrollo)

Requiere Docker y una instancia de Minerva accesible (dev: `localhost:9000`).

```bash
cp .env.example .env   # ajusta credenciales y datos de Minerva (incl. GITHUB_TOKEN)
# minerva-sdk es dependencia base de un repo privado: exporta el PAT al shell
# antes de construir — compose lo lee del entorno, no del .env.
set -a && . ./.env && set +a
docker compose -f infra/docker-compose.yml up --build
```

- Backend: http://localhost:8000 — health en `/health`, OpenAPI en `/docs`
- Frontend: http://localhost:5173

Pasos detallados (clave de cifrado, registro del manifest en Minerva, despliegue de
producción) en [`docs/development.md`](docs/development.md) y
[`docs/deployment.md`](docs/deployment.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura global, cadena de datos, stack |
| [`docs/development.md`](docs/development.md) | Arranque local, comandos frecuentes |
| [`docs/deployment.md`](docs/deployment.md) | Despliegue de producción (compose + nginx) |
| [`docs/api.md`](docs/api.md) | Índice de endpoints |
| [`docs/database.md`](docs/database.md) | Modelo de datos |
| [`docs/security.md`](docs/security.md) | Seguridad de SQL, cifrado, auth |
| [`docs/auth-minerva.md`](docs/auth-minerva.md) | Integración OIDC con Minerva |
| [`docs/checklist.md`](docs/checklist.md) | Estado de cada módulo |
| `docs/modules/*.md` | Documentación por módulo (auth, connections, datasets, charts, dashboards) |

## Estado

Módulos implementados: **auth** (BFF/OIDC), **connections**, **datasets** (SQL guard,
playground), **charts** (ChartSpec 1.0, constructor visual, 9 tipos, versionado,
overrides, temas), **dashboards** (tableros internos con filtros). Ver
[`docs/checklist.md`](docs/checklist.md) para el detalle y lo pendiente
(auditoría, publicación de dashboards, API pública, municipios).
