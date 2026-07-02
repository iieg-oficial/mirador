# Módulo: Dashboards (Tableros internos)

**Ruta backend:** `backend/app/modules/dashboards/`
**Endpoints:** `/api/admin/dashboards/*`
**Frontend:** `frontend/src/features/dashboards/`
**Estado:** Implementado ✅ (tableros exploratorios internos; publicación/snapshot pendiente)

---

## Responsabilidad

Tableros exploratorios del laboratorio de datos: un grid donde los analistas acomodan gráficas guardadas y widgets de texto. El layout se persiste como **configuración JSON**, nunca como HTML. Soporta filtros globales a nivel tablero y filtros propios por gráfica (RF-13/RF-14).

Este módulo cubre el uso interno; el flujo de publicación (versiones inmutables, API pública) es una fase posterior.

---

## Modelo

| Tabla | Campos clave |
|---|---|
| `dashboards` | `name`, `description`, `status` (`draft/archived`), `global_filters` JSONB (`[{field, operator, value}]`) |
| `dashboard_items` | `dashboard_id` (FK cascade), `chart_id` (FK nullable), `item_type` (`chart\|text`), `position_config` JSONB (`{x,y,w,h}`), `local_config` JSONB |

`local_config` guarda los filtros propios del item (`{filters: [...]}`) o el contenido del widget de texto (`{content: "..."}`).

## Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | view | Lista (excluye archivados) |
| POST | `/` | create | Crea tablero |
| GET | `/{id}` | view | Detalle con items embebidos |
| PUT | `/{id}` | update | Nombre/descripción/`global_filters` (validados con el `FilterSpec` de charts) |
| DELETE | `/{id}` | delete | Borrado lógico |
| PUT | `/{id}/items` | update | **Reemplazo en bloque** del layout (como lo entrega react-grid-layout); valida que cada gráfica exista y no esté archivada |

## Frontend

`TablerosPage.tsx`: lista/creación + editor con `react-grid-layout` (12 columnas, mover/redimensionar). Cada gráfica del grid ejecuta su ChartSpec vía `POST /charts/preview` (agregación server-side + caché Redis compartido, y el mismo `ChartRenderer` que usa el builder — hereda exportación PNG/CSV si la gráfica tiene `interactions.download` activo, ver `docs/modules/charts.md`).

**Filtros (RF-14):**
- **Globales:** barra en el editor sobre la unión de columnas de los datasets usados; se persisten en `dashboard.global_filters`. Cada gráfica recibe solo los compatibles (el campo debe existir en su dataset).
- **Locales:** por gráfica (botón ⚙), guardados en `local_config.filters` junto con el layout; se aplican encima de los globales.
- El widget muestra un badge con el número de filtros heredados/propios activos.

## Tests

`test_dashboards.py` (CRUD, layout en bloque, validación de gráficas y de filtros globales).
