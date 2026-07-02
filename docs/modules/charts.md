# Módulo: Charts (Visualizaciones dinámicas)

**Ruta backend:** `backend/app/modules/charts/`
**Endpoints:** `/api/admin/charts/*`
**Frontend:** `frontend/src/features/charts/`
**Estado:** Implementado ✅

---

## Responsabilidad

Módulo central del laboratorio de datos: los analistas crean, validan, previsualizan, versionan y clonan gráficas sobre datasets registrados, sin escribir código ni SQL. Cada gráfica se persiste como una **ChartSpec 1.0** — una especificación JSON versionada e independiente del motor de render:

```
Dataset + ChartSpec = Visualización
```

La spec describe QUÉ datos usa la gráfica (dataset, filtros, orden, límite) y CÓMO se visualiza (tipo, encodings, interacciones, estilo). El backend genera desde ella la consulta SQL segura; el frontend la convierte en `EChartsOption` (o en componentes React para `table`/`kpi`).

---

## Archivos

| Archivo | Rol |
|---|---|
| `models.py` | `Chart` (con `chart_spec` JSONB canónico + `dataset_id`/`chart_type` denormalizados), `ChartVersion` (historial), `ChartStatus` |
| `spec.py` | Esquema Pydantic de la ChartSpec 1.0 + `validate_spec_against_dataset` (reglas por tipo) + `parse_spec` (errores legibles) |
| `query_builder.py` | `build_query`: ChartSpec → SQL seguro (whitelist de columnas, params nombrados, agregación/GROUP BY server-side) |
| `schemas.py` | DTOs: create/update/read, payload de validación, `ChartPreviewResult` (filas + `generated_sql` + warnings), versiones |
| `service.py` | CRUD, validación, preview por spec (con caché), snapshot de versiones, restore, clone |
| `router.py` | Endpoints con permisos `tablerillos.charts.*` |

Frontend: `GraficasPage.tsx` (builder visual con drag-and-drop, filtros, agregaciones, historial), `SpecEditor.tsx` (editor JSON con CodeMirror), `ChartRenderer.tsx` (adaptador spec→ECharts + render de tabla/KPI), `ChartTypePicker.tsx`, `filters.ts`, tipos espejo en `src/types/charts.ts`.

---

## ChartSpec 1.0

```json
{
  "version": "1.0",
  "data": {
    "dataset_id": "…",
    "filters": [{ "field": "anio", "operator": "=", "value": 2025 }],
    "sort": [{ "field": "poblacion", "direction": "desc" }],
    "limit": 1000
  },
  "visual": { "chart_type": "bar", "title": "…", "subtitle": "…" },
  "encodings": {
    "x": [{ "field": "municipio" }],
    "y": [{ "field": "poblacion", "aggregation": "sum" }],
    "color": { "field": "region" },
    "tooltip": [],
    "fields": {}
  },
  "interactions": { "tooltip": true, "legend": true, "zoom": false, "download": false },
  "style": { "theme": "institutional", "show_labels": false, "orientation": "vertical", "legend_position": "top" }
}
```

- **9 tipos:** `line, bar, pie, scatter, candlestick, boxplot, treemap, table, kpi`. Candlestick/boxplot usan `encodings.fields` (columnas nombradas); `table`/`kpi` se renderizan como componentes React, no ECharts.
- **Operadores de filtro:** `= != > >= < <= in not_in contains between is_null is_not_null`, validados por forma del valor.
- **Agregaciones:** `sum avg min max count count_distinct`, limitadas por columna según la metadata semántica del dataset (`columns_schema`).
- Reglas por tipo (pie/treemap 1 dim + 1 métrica, kpi métrica agregada, etc.) en `spec.py`.

## Generación segura de consulta

`build_query` envuelve el SQL ya validado del dataset como subconsulta:

```sql
SELECT "dim", SUM("metrica") AS "metrica"
FROM (<sql del dataset>) AS _ds
WHERE "campo" = :_f0
GROUP BY "dim" ORDER BY "metrica" DESC
```

- Identificadores **solo** del whitelist de `columns_schema`, siempre citados.
- Valores de filtro como parámetros nombrados (`:_f0`), nunca concatenados.
- Límite efectivo `min(spec.limit, dataset.max_rows)` aplicado por `run_query` (LIMIT n+1 para detectar truncamiento).
- Red de seguridad: el SQL compuesto vuelve a pasar por `sql_guard` y se ejecuta read-only con timeout.
- Caché Redis por `ds:{dataset_id}:chart:{hash_sql}`; la invalidación por dataset también limpia estos previews.

## Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | view | Lista (`?status=` filtra; sin filtro excluye archivadas) |
| POST | `/` | create | Crea desde `{name, description, chart_spec}` |
| GET/PUT/DELETE | `/{id}` | view/update/delete | Detalle / actualizar (snapshotea versión si cambia la spec) / archivar |
| POST | `/validate` | view | `{valid, errors, warnings}` sin guardar |
| POST | `/preview` | view | Ejecuta una spec sin guardar → filas + `generated_sql` |
| POST | `/{id}/preview` | view | Ejecuta la spec guardada |
| POST | `/{id}/clone` | create | Copia independiente en borrador |
| GET | `/{id}/versions` | view | Historial descendente |
| POST | `/{id}/restore/{version_id}` | update | Restaura (snapshotea el vigente antes) |

## Versionado y estados

- Cada update que cambia la spec guarda el spec **anterior** en `chart_versions` con autor y comentario opcional (`change_comment`).
- Estados: `draft → in_review → approved → archived` (transición libre; sin workflow de aprobación formal en el laboratorio).

## Decisiones de diseño

- El adaptador spec→EChartsOption vive **solo en el frontend** (`buildOption`, exportado); el editor avanzado lo muestra como referencia técnica (RF-09). La portabilidad futura (Vega-Lite, Plotly…) la da la ChartSpec neutral + el campo `renderer`.
- Sin SQL ni JavaScript libres desde la gráfica (RNF-01); el editor avanzado solo edita la spec declarativa.
- Mapas geográficos: fuera de alcance (los cubre otro proyecto).

## Tests

`test_chart_spec.py`, `test_chart_query_builder.py`, `test_charts.py`, `test_chart_versions.py`.
