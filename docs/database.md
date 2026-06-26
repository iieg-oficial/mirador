# Base de datos — Tablerillos

> Stub inicial (Fase 0). Los modelos SQLModel y la migración inicial llegan en
> la Fase 1.

## Principios

- **Sin tablas de identidad local** (`users`, `roles`, `permissions`): la
  identidad y autorización viven en Minerva. `created_by` guarda el `sub` de
  Minerva; tabla espejo opcional `user_profiles` solo para legibilidad.
- Toda tabla de metadata usa `id: UUID`, `created_at`, `updated_at`.
- PostGIS disponible; la geometría de municipios es opcional en MVP1 (nullable).

## Tablas de metadata planeadas

```
connections
datasets, dataset_columns, dataset_parameters
charts
dashboards, dashboard_versions, dashboard_widgets, dashboard_publications
exports (export_jobs)
audit_logs
query_execution_logs
municipios
user_profiles            # opcional, espejo no autoritativo de Minerva
```

Migraciones gestionadas con Alembic (`backend/alembic/`).
