# Base de datos — Tablerillos

## Principios

- **Sin tablas de identidad local** (`users`, `roles`, `permissions`): la
  identidad y autorización viven en Minerva. `created_by` guarda el `sub` de
  Minerva (+ `created_by_email` para legibilidad); no existe una tabla
  `user_profiles` (no fue necesaria hasta ahora).
- Toda tabla de metadata usa `id: UUID` (PK), `created_at`, `updated_at`
  (`UUIDAuditBase` en `app/shared/models.py`).
- PostGIS está disponible pero sin uso actual (la capa de municipios está pospuesta).

## Tablas de metadata (implementadas)

| Tabla | Migración | Módulo | Notas |
|---|---|---|---|
| `connections` | `0001_initial_connections.py`, `0005_connection_ssl_mode.py` | connections | `encrypted_password` (Fernet), `status`/`last_test_error` |
| `datasets` | `0002_datasets.py`, `0004_dataset_slug_partial_unique.py` | datasets | `sql_query` TEXT, `columns_schema`/`parameters_schema` JSONB, slug único parcial (excluye archivados) |
| `charts` | `0003_charts.py`, `0006_chart_spec.py` | charts | `chart_spec` JSONB (ChartSpec 1.0 canónica), `dataset_id`/`chart_type` denormalizados |
| `chart_versions` | `0007_chart_versions.py` | charts | Historial de `chart_spec` con autor y comentario opcional |
| `dashboards` | `0008_dashboards.py` | dashboards | `status` (`draft`/`archived`), `global_filters` JSONB |
| `dashboard_items` | `0008_dashboards.py` | dashboards | FK a `dashboards` (cascade) y a `charts` (nullable), `position_config`/`local_config` JSONB |

Detalle de columnas en `docs/modules/<módulo>.md`.

## Tablas pospuestas (no existen aún)

Quedan fuera del alcance actual (lab de datos interno); se documentan como referencia
para cuando se retomen esas fases:

```
query_execution_logs     # auditoría de ejecuciones (módulo audit, placeholder vacío)
dashboard_versions       # snapshot inmutable para publicación
dashboard_publications   # metadata de publicación
municipios               # catálogo + geometría PostGIS (módulo municipios, placeholder)
export_jobs              # cola de exportación asíncrona (la exportación actual es
                          # 100% client-side, sin tabla ni job)
```

## Migraciones

Gestionadas con Alembic (`backend/alembic/`). Se aplican automáticamente al arrancar el
backend (`alembic upgrade head` antes de `uvicorn`, en dev y en producción).

```bash
conda run -n tab alembic upgrade head
conda run -n tab alembic revision --autogenerate -m "descripcion"
```
