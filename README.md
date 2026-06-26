# Tablerillos

Sistema de **Business Intelligence institucional del IIEG**. Evoluciona los
antiguos *Cuadernillos Municipales* (reportes estadísticos por municipio de
Jalisco) hacia dashboards web interactivos, exportables y reutilizables.

- **Gestores / Administradores**: gestionan conexiones, crean datasets desde SQL,
  construyen gráficas y diseñan dashboards en un canvas visual, los publican.
- **Visitantes**: consultan dashboards publicados y filtran por municipio, año,
  etc., **sin necesidad de login**.

La autenticación y la gestión de usuarios/roles/permisos se delegan a **Minerva**
(el IdP institucional del IIEG) vía OIDC. Ver [`docs/auth-minerva.md`](docs/auth-minerva.md).

## Stack

- **Backend**: FastAPI · SQLModel · Alembic · PostgreSQL/PostGIS · Redis · Python 3.12+
- **Frontend**: React · TypeScript · Vite · TanStack Query · Zustand · React Router ·
  Tailwind · React-Grid-Layout · Plotly.js
- **Infra**: Docker · docker-compose

## Estructura del monorepo

```text
tablerillos/
├── backend/      # API FastAPI + BFF de auth (Minerva)
├── frontend/     # SPA React/TS/Vite (admin + público)
├── infra/        # docker-compose, nginx, scripts
├── docs/         # arquitectura, api, base de datos, seguridad, auth-minerva
├── manifest.minerva.yml   # permisos y roles declarados a Minerva
└── README.md
```

## Arranque rápido

Requiere Docker y una instancia de Minerva accesible (dev: `localhost:9000`).

```bash
cp .env.example .env          # ajusta credenciales y datos de Minerva
docker compose -f infra/docker-compose.yml up --build
```

- Backend: http://localhost:8000 — health en `/health`, OpenAPI en `/docs`
- Frontend: http://localhost:5173

Pasos detallados (clave de cifrado, registro del manifest en Minerva) en
[`docs/development.md`](docs/development.md).

## Estado

🚧 **Fase 0 — andamiaje.** Estructura del monorepo, docker-compose, configuración
y documentación base. La implementación de módulos (auth con Minerva, conexiones,
datasets, gráficas, dashboards, vistas públicas) sigue en fases posteriores según
el plan acordado.
