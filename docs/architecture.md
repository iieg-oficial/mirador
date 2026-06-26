# Arquitectura — Tablerillos

> Stub inicial (Fase 0). Se completa conforme avanza la implementación.

## Visión general

Monorepo con tres piezas:

- **backend/** — API FastAPI (Python 3.12+, SQLModel, Alembic, PostgreSQL/PostGIS,
  Redis). Actúa también como BFF de autenticación contra Minerva.
- **frontend/** — SPA React + TypeScript + Vite. Dos áreas: panel admin
  (`/admin`) y vistas públicas (`/`).
- **infra/** — docker-compose (postgres, redis, backend, frontend) y scripts.

## Separación de conceptos

Connection → Dataset → Chart → Dashboard → DashboardVersion → DashboardPublication.
Esta cadena permite reutilizar datasets en varias gráficas y gráficas en varios
dashboards. La versión publicada es un snapshot inmutable.

## Autenticación

Delegada a Minerva (OIDC) en modelo BFF. Ver [`auth-minerva.md`](auth-minerva.md).

## Pendiente de documentar

- Diagrama de componentes detallado.
- Flujo de ejecución de queries y caché.
- Workers de exportación (Playwright).
