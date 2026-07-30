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

Frontend: `GraficasPage.tsx` (builder visual con drag-and-drop, filtros, agregaciones, historial), `SandboxEditor.tsx` (editor de código con CodeMirror, JS·ECharts o Python·Plotly), `sandbox.ts` (ejecuta el JS del modo avanzado), `pythonRuntime.ts` (ejecuta el Python vía Pyodide), `ChartRenderer.tsx` (adaptador spec→ECharts + render de tabla/KPI + dispatcher de la barra de parámetros), `ParamBar.tsx`/`ParamConfigPanel.tsx`/`params.ts` (parámetros interactivos del modo avanzado, ver más abajo), `ChartTypePicker.tsx`, `filters.ts`, tipos espejo en `src/types/charts.ts`.

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
  "style": { "theme": "institutional", "show_labels": false, "orientation": "vertical", "legend_position": "top" },
  "overrides": { "legend": { "orient": "vertical", "right": 0 } }
}
```

- **9 tipos:** `line, bar, pie, scatter, candlestick, boxplot, treemap, table, kpi`. Candlestick/boxplot usan `encodings.fields` (columnas nombradas); `table`/`kpi` se renderizan como componentes React, no ECharts.
- **Operadores de filtro:** `= != > >= < <= in not_in contains between is_null is_not_null`, validados por forma del valor.
- **Agregaciones:** `sum avg min max count count_distinct`, limitadas por columna según la metadata semántica del dataset (`columns_schema`).
- Reglas por tipo (pie/treemap 1 dim + 1 métrica, kpi métrica agregada, etc.) en `spec.py`.
- **`overrides` (opcional):** personalización controlada del EChartsOption generado. Whitelist de secciones (`legend`/`tooltip`/`grid`), cada valor un objeto JSON puro; el backend rechaza otras secciones, claves peligrosas (`__proto__`/`constructor`/`prototype`, anti prototype-pollution) y payloads > 8 KB. El frontend hace deep-merge (`applyOverrides` en `ChartRenderer.tsx`) sobre el option antes de `setOption`; el editor avanzado muestra el resultado ya fusionado. Sin funciones ni código: los `formatter` string de ECharts son plantillas.
- **Temas (`style.theme`):** `institutional` (default) o `default`. El tema institucional (paleta morada/naranja IIEG-Jalisco) se registra en `frontend/src/features/charts/themes.ts` y se pasa a `echarts.init`; `default` usa el tema base de ECharts.
- **Exportación (`interactions.download`):** cuando es `true`, activa el toolbox `saveAsImage` de ECharts (descarga PNG) y muestra el botón "Descargar CSV" (`TableRenderer` y el preview del builder), gateado por el mismo flag. El toggle vive en el panel de configuración visual del builder ("Permitir descargar como imagen (PNG)"). El CSV es 100% client-side (`frontend/src/lib/csv.ts`, RFC 4180 + BOM) desde las filas ya cargadas — no hay endpoint de exportación.

## Gráfica de código (modo avanzado)

Alternativa a los encodings declarativos: `chart_spec.code` (JS o Python) construye
la visualización a mano a partir de las filas del dataset. Es una **herramienta
interna sin aislamiento real** (`new Function` en el navegador del propio autor,
o Pyodide para Python) — deliberado, ver el comentario en `SandboxEditor.tsx`.
Cuando `code` está presente, los `encodings` no aplican; el backend solo entrega
las filas crudas del dataset (`query_builder.py`), pero **sí** aplica
`data.filters`/`data.sort` (por eso los filtros globales de un tablero siguen
funcionando en una gráfica de código).

- **`code_engine`**: `"echarts"` (default) ejecuta JS en el navegador; `"plotly"`
  ejecuta Python vía Pyodide y renderiza con `plotly.js`.
- **Motor `echarts`** — el código es el cuerpo de una función con tres argumentos
  en scope: `rows` (filas), `echarts` (el módulo) y `params` (ver abajo). Debe
  `return` un `EChartsOption`, o `{ option, events }` para además registrar
  manejadores de eventos de la instancia:
  ```js
  return {
    option: { series: [...] },
    events: {
      legendselectchanged(params, api) { api.highlight(params.name) },
      click(params, api) { /* ... */ },
    },
  }
  ```
  `api` es una superficie acotada sobre la instancia (`highlight`/`downplay`/
  `select`/`unselect`/`dispatchAction`) — acotada por ergonomía y estabilidad de
  contrato, **no como frontera de seguridad** (el sandbox ya corre sin
  aislamiento). Devolver un `option` a secas sigue funcionando: es el mismo
  contrato que antes de que existieran los eventos.
- **Toolbox personalizado (`toolbox.feature.myXXX`)** — soportado tal cual lo
  documenta ECharts (nombre con prefijo `my`, `onclick` propio). `runUserCode`
  (`sandbox.ts`) le da al `toolbox` un `id` nuevo en cada corrida: ECharts
  reutiliza la vista del toolbox (y su caché de features) entre llamadas a
  `setOption` que comparten id, pero solo lee `onclick` cuando la feature se
  crea por primera vez, no en cada actualización (ver
  [apache/echarts#17158](https://github.com/apache/echarts/issues/17158)) —
  sin el id nuevo, un botón `myXXX` puede quedar con un `onclick` obsoleto o
  fallar con `"Bind must be called on a function"` al re-ejecutar el código.
- **Motor `plotly`** — el código recibe `rows` (lista de dicts) y `params` (dict)
  en el scope de Python; debe dejar la figura en una variable `fig`. No soporta
  eventos.
- **`params` (`ChartSpec.params`, opcional):** parámetros interactivos declarados
  en la spec — controles (`select`/`multiselect`/`radio`/`checkbox`/`slider`/
  `date`/`number`/`text`) que el usuario final manipula sin recargar datos del
  servidor; sus valores llegan al sandbox como `params.<id>`. Puramente
  client-side: no genera SQL, no se valida contra `columns_schema` salvo
  `options_from_column` (debe ser una columna real del dataset). Útil para el
  caso de series con muchas categorías (p.ej. los 125 municipios de Jalisco):
  un `select` filtra `rows` en el propio código en vez de recargar la gráfica
  o mostrar una leyenda horizontal impracticable. El frontend pinta la barra
  de controles (`ParamBar.tsx`) automáticamente cuando `params` no está vacío.

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

- El adaptador spec→EChartsOption vive **solo en el frontend** (`buildOption`, exportado). La portabilidad futura (Vega-Lite, Plotly…) la da la ChartSpec neutral + el campo `renderer`.
- El modo avanzado sí permite JS/Python libres (`chart_spec.code`, ver arriba) — es una excepción deliberada a RNF-01 para esta herramienta interna, no una spec 100% declarativa. El SQL sigue siendo siempre generado por `query_builder`, nunca libre.
- Mapas geográficos: fuera de alcance (los cubre otro proyecto).

## Tests

`test_chart_spec.py`, `test_chart_query_builder.py`, `test_charts.py`, `test_chart_versions.py`.
