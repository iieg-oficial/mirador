# Revisión de código — hallazgos previos a la siguiente etapa

> **Fecha:** 2026-06-29
> **Alcance:** backend (FastAPI) + frontend (React/TS), con foco en ejecución de SQL,
> caché, modelos/migraciones, auth y los módulos recién agregados (charts).
> **Estado del repo revisado:** rama `develop`, commits hasta `1f30808`.
> **Propósito:** este documento es el insumo para crear una rama de correcciones
> (p. ej. `fix/revision-pre-dashboards`). No es definitivo: las decisiones de diseño
> (sobre todo el punto #3) deben acordarse antes de tocar código.

## Veredicto general

La arquitectura es sólida y está bien separada (cadena
`Connection → Dataset → Chart → Dashboard`, BFF de auth limpio, cifrado Fernet aislado,
permisos declarados en `manifest.minerva.yml`). **Se puede continuar** a dashboards /
publicación / API pública, pero conviene cerrar antes:

- **2 bugs latentes** (#1 y #2) que las capas siguientes heredarán porque se apoyan
  directamente en la ejecución de datasets y en las specs de charts.
- **1 decisión de diseño** (#3) que, si se arrastra, va a complicar filtros y dashboards.

Prioridad sugerida para la rama de fix:
`#1 → #2 → #4 → #5 → #6` (correctitud) y luego `#3` (requiere decisión) + housekeeping.

---

## 🔴 Crítico

### #1 — Los casts de PostgreSQL (`::`) rompen toda query que los use

**Archivo:** `backend/app/modules/datasets/service.py:219-221`
**Severidad:** Alta · **Probabilidad:** se dispara de inmediato

El helper que traduce parámetros nombrados `:name → %(name)s` también captura el
**segundo** `:` de un cast `::`, porque el regex no distingue `::` de `:param`.

```python
def _named_to_psycopg(sql: str) -> str:
    """Convierte parámetros :name → %(name)s (estilo psycopg named)."""
    return re.sub(r":([a-zA-Z_][a-zA-Z0-9_]*)", r"%(\1)s", sql)
```

**Reproducción (verificada):**

| SQL de entrada | Resultado actual (roto) |
| --- | --- |
| `SELECT fecha::date FROM ventas` | `SELECT fecha:%(date)s FROM ventas` |
| `SELECT now()::text` | `SELECT now():%(text)s` |
| `SELECT monto::numeric` | `SELECT monto:%(numeric)s` |

Consecuencias:
1. La SQL queda sintácticamente rota (`fecha:%(date)s`).
2. Se inyecta un **bind param fantasma** (`date`, `text`, `numeric`…) que psycopg
   exigirá y nunca se provee → error en ejecución.

Los casts `::` son extremadamente comunes en Postgres, así que prácticamente cualquier
dataset/playground real fallará. **No lo atrapa `validate_sql`** (sqlglot parsea bien el
SQL original): el error aparece recién al ejecutar.

**Fix propuesto (mínimo):** no capturar cuando el `:` viene precedido o seguido de otro
`:`.

```python
def _named_to_psycopg(sql: str) -> str:
    # (?<!:) no precedido por ':'   (?!:) no seguido por ':'  → ignora '::cast'
    return re.sub(r"(?<!:):(?!:)([a-zA-Z_][a-zA-Z0-9_]*)", r"%(\1)s", sql)
```

**Limitación conocida del fix mínimo:** sigue tocando ocurrencias dentro de literales de
cadena (p. ej. `WHERE x = '12:hora'`). El arreglo completo requiere tokenizar/parsear
(sqlglot ya está en el stack y podría reescribir los placeholders de forma segura). Para
el MVP el lookbehind/lookahead cubre el daño real (los casts); dejar el caso de literales
como mejora posterior.

**Recomendación adicional:** agregar tests de `_named_to_psycopg` que cubran:
`:param` simple, `::cast`, `a::b::c` encadenado, y un literal con `:`.

---

### #2 — El modelo `Chart` no está registrado en la metadata de SQLModel

**Archivo:** `backend/app/models.py`
**Severidad:** Alta (latente) · **Probabilidad:** rompe tests de charts y autogenerate

`app/models.py` (el agregador que puebla `SQLModel.metadata` para Alembic y tests)
importa `Connection` y `Dataset` pero **no `Chart`**:

```python
from app.shared.models import UUIDAuditBase  # noqa: F401
from app.modules.connections.models import Connection  # noqa: F401,E402
from app.modules.datasets.models import Dataset  # noqa: F401,E402
# ← falta Chart
```

La tabla `charts` existe en la BD **solo** porque la migración `0003_charts.py` se escribió
a mano. Pero como el modelo no está en la metadata:

1. **Tests:** `conftest.py` hace `SQLModel.metadata.create_all(engine)` sobre SQLite en
   memoria. Sin `Chart` en la metadata, la tabla `charts` **no se crea** → cualquier test
   del módulo charts fallará con "no such table: charts".
2. **Alembic autogenerate:** un futuro `alembic revision --autogenerate` comparará la BD
   real (que tiene `charts`) contra la metadata (que no) y generará un **`drop_table('charts')`**
   espurio. Riesgo de pérdida de datos si se aplica sin revisar.
3. Cualquier herramienta que recorra `SQLModel.metadata` (seeds, introspección) omite charts.

**Fix:** una línea.

```python
from app.modules.charts.models import Chart  # noqa: F401,E402
```

---

## 🟡 Medio

### #3 — Pipeline de validación huérfano (DECISIÓN DE DISEÑO)

**Archivos:** `backend/app/modules/datasets/service.py:88-118` (`validate_dataset`),
`backend/app/modules/datasets/router.py:102-118` (endpoint `/validate`),
`backend/app/modules/datasets/models.py` (`status`, `columns_schema`, `parameters_schema`),
`frontend/src/features/datasets/DatasetsPage.tsx` (botón eliminado en commit `1f30808`).

Al quitar el botón "Validar query" del frontend, **nada llama ya** a `validate_dataset`.
Efectos:

- Los datasets quedan en estado `draft` para siempre (nunca pasan a `validated`).
- `columns_schema` y `parameters_schema` quedan **siempre en `null`**.
- El `ChartBuilder` lo esquiva leyendo columnas desde un `preview` en vivo
  (`previewDataset`) en lugar de `columns_schema`.

Es decir, toda la infraestructura de inferencia de esquema y el estado `validated` quedaron
como **código muerto**, y los datasets **parametrizados** (`:param`) no tienen forma de
exponer sus parámetros declarados a la UI (que vendrían de `parameters_schema`).

**Por qué importa ahora:** filtros y dashboards van a necesitar conocer columnas y
parámetros de un dataset. Construir esas capas sobre un pipeline de inferencia muerto
multiplica el problema.

**Opciones (elegir una antes de codear):**

- **(A) Re-cablear la validación:** ejecutar `validate_dataset` automáticamente al
  crear/actualizar el SQL (poblar `columns_schema`/`parameters_schema` y marcar
  `validated`). Mantiene el diseño original; el front consume el esquema persistido.
- **(B) Eliminar el estado:** quitar `validated`, `columns_schema` y `parameters_schema`
  del modelo (con su migración) y declarar que las columnas/params se obtienen siempre por
  `preview` en vivo. Más simple, pero pierde la fuente de verdad persistida que dashboards
  podrían querer cachear.

> Recomendación: **(A)**, porque dashboards/filtros se benefician de un esquema persistido
> y estable; pero es decisión del equipo.

---

### #4 — Un `;` final rompe la ejecución

**Archivo:** `backend/app/modules/datasets/service.py:163` (y `179` para el count)
**Severidad:** Media · **Probabilidad:** alta (es natural teclear `;` al final)

`run_query` envuelve la SQL del usuario en una subconsulta:

```python
limited_sql = f"SELECT * FROM ({psycopg_sql}) AS _rows LIMIT {max_rows + 1}"
```

Si la query guardada termina en `;`, queda `(SELECT … ;) AS _rows` → **error de sintaxis**.
`validate_sql` lo acepta (sqlglot parsea `SELECT 1;` como un solo statement válido), así que
no se detecta antes.

**Fix:** normalizar en `validate_sql` (o antes de envolver) con `sql.strip().rstrip(";").strip()`,
y/o rechazar explícitamente `;` interno. Cuidado de no romper el conteo de statements del guard.

---

### #5 — `slug` único + borrado lógico + `IntegrityError` sin manejar

**Archivos:** `backend/app/modules/datasets/models.py:31` (`slug` unique),
`backend/app/modules/datasets/service.py:52-62` (`create_dataset`),
`backend/app/modules/datasets/router.py:53-63`.

Dos problemas relacionados:

1. **500 en vez de 422/409:** `create_dataset` no captura `IntegrityError`. Un slug
   duplicado revienta con error 500 genérico en lugar de un mensaje limpio.
2. **Slug bloqueado tras archivar:** el borrado es lógico (`status = archived`), la fila
   permanece y **sigue ocupando el slug único**. No se puede recrear un dataset con el mismo
   slug aunque el anterior esté archivado.

**Fix propuesto:**
- Capturar `sqlalchemy.exc.IntegrityError` en el router → HTTP 409 con detalle legible.
- Definir política de unicidad: o liberar/renombrar el slug al archivar, o usar un índice
  único parcial `WHERE status != 'archived'` (Postgres lo soporta).

> Nota: las `connections` no tienen campo único, así que este patrón solo afecta a datasets
> (y a cualquier tabla futura con `unique=True` + borrado lógico, p. ej. dashboards con slug).

---

### #6 — Drift de tipos entre resultado cacheado y no-cacheado

**Archivos:** `backend/app/core/cache.py:60-65` (`set_cached`),
`backend/app/modules/datasets/service.py:144-200` (`run_query`).

`set_cached` serializa con `json.dumps(data, default=str)`: los tipos no-JSON
(`datetime`, `date`, `Decimal`, etc.) se convierten a **string solo en la ruta cacheada**.

- **Primera carga (miss):** `PreviewResult` devuelve los valores con su tipo real (la fecha
  es fecha, el decimal es número).
- **Cargas siguientes (hit):** `PreviewResult(**cached)` reconstruye con los valores ya
  stringificados.

El frontend grafica `r[y]`; un valor numérico que en cache se volvió string puede romper el
eje de la gráfica o cambiar el formato mostrado, **dependiendo del estado del caché** (bug
intermitente, difícil de diagnosticar).

**Fix propuesto:** normalizar la serialización en **ambas** rutas (serializar una vez, antes
de devolver, para que miss y hit produzcan exactamente la misma forma). O definir un
`json_serializer`/`model_dump(mode="json")` consistente y aplicarlo siempre.

---

### #7 — `COUNT(*)` duplica el costo de cada preview

**Archivo:** `backend/app/modules/datasets/service.py:176-184`

Cada preview ejecuta la query **dos veces**: una para las filas limitadas y otra para
`SELECT COUNT(*) FROM ({query}) AS _cnt`. Con queries analíticas pesadas, esto **dobla**
latencia y carga sobre la BD externa. Está envuelto en `try/except` (best-effort), pero el
costo se paga igual aunque luego se descarte.

**Fix propuesto:** calcular `total_rows` solo cuando sea barato, o derivarlo del propio
resultado cuando no hubo truncamiento (`if not truncated: total_rows = len(rows)`), o hacerlo
opcional vía parámetro (el playground casi nunca necesita el total exacto).

---

## 🟢 Menor / housekeeping

### #8 — Duplicación de `_make_conninfo`
`backend/app/modules/connections/service.py:147-157` y
`backend/app/modules/datasets/service.py:206-216` son **idénticos**. Extraer a un helper
compartido (p. ej. `connections/service.py` o un `core/db_external.py`) para que no diverjan
si cambia el manejo de SSL/timeout.

### #9 — `cache.py`: `KEYS` y captura demasiado amplia
`backend/app/core/cache.py:70-78`
- `invalidate` usa `r.keys("ds:{id}:*")` → `KEYS` es **O(N) y bloquea Redis**. Cambiar a
  `SCAN` antes de que el keyspace crezca.
- `except (RedisError, Exception)` es redundante (`Exception` ya cubre `RedisError`) y traga
  **cualquier** error como simple warning, ocultando posibles bugs reales (p. ej. de
  serialización).

### #10 — Comentarios obsoletos contradicen la regla "no hay stub de auth"
`backend/app/main.py:3-4` dice *"stub en dev, Minerva en prod"*; comentarios similares en
`config.py`. `CLAUDE.md` es enfático en que **no existe stub**: la auth es siempre Minerva.
En la zona más sensible del sistema, estos comentarios desactualizados confunden. Corregir.

### #11 — El form de edición de dataset envía campos que el backend ignora
`frontend/src/features/datasets/DatasetForm.tsx:77-89` manda un payload con forma de
`DatasetCreate` (incluye `slug` y `connection_id`) a `updateDataset`, pero el schema
`DatasetUpdate` (`backend/app/modules/datasets/schemas.py:32-38`) **no acepta** esos campos
→ Pydantic los descarta en silencio. El usuario edita el slug y "se guarda" sin efecto.
Volverlos read-only en modo edición o soportarlos explícitamente en el update.

### #12 — UX al editar una gráfica
`frontend/src/features/charts/GraficasPage.tsx` (`ChartBuilder`): al abrir una gráfica
guardada, los `<select>` de campos X/Y/serie salen vacíos y no se renderiza la gráfica hasta
que el usuario pulsa "Actualizar vista" (las opciones de columnas vienen solo del preview en
vivo, `previewData`). Auto-disparar el preview al entrar al builder con un dataset ya
seleccionado.

### #13 — Sin pooling para queries externas
Cada preview/ejecución abre un `psycopg.connect` nuevo (`_make_conninfo`). Aceptable en MVP,
pero el **dashboard público con N gráficas** hará N conexiones por carga. Tenerlo presente al
construir esa etapa (pool por `Connection`, o reutilización dentro de una request).

### #14 — Higiene de git
`jalisco.gpkg` (564K) y `ui/` (~9.7 MB de mockups PNG) están **sin trackear y no en
`.gitignore`** → riesgo de commitearlos por accidente. Agregarlos a `.gitignore` (o
commitearlos deliberadamente en un lugar pensado para assets de diseño).

---

## Lo que está bien (no tocar)

- Cifrado Fernet correcto, aislado en `core/security.py`, password nunca serializado al front.
- Permisos de charts **sí** declarados en `manifest.minerva.yml` (convención respetada).
- Defensa en capas del SQL guard: sqlglot (un solo statement, raíz SELECT/WITH) + blacklist.
- `read_only = True` + `statement_timeout` aplicados en toda ejecución externa.
- Exploración de esquema con queries **parametrizadas** (`%s`), sin concatenación.
- BFF: los tokens viven server-side, el navegador nunca los ve.
- Migraciones versionadas y encadenadas correctamente (`0001 → 0002 → 0003`).

---

## Checklist para la rama de fix

Resuelto en `fix/revision-pre-dashboards`. Todos los puntos salvo #13 (futuro,
explícitamente diferido) están atendidos con tests donde aplica.

- [x] #1 `_named_to_psycopg`: lookbehind para `::` (el lookbehind solo ya cubre
      `::cast` y casts encadenados) + tests
- [x] #2 registrar `Chart` en `app/models.py`
- [x] #4 normalizar `;` final en `validate_sql`/`run_query`/`validate_dataset`
- [x] #5 capturar `IntegrityError` (409) + slug único solo entre datasets no
      archivados (índice parcial, migración `0004`)
- [x] #6 serialización consistente miss/hit del caché (`model_dump(mode="json")`
      siempre, antes de cachear y antes de devolver)
- [x] #7 evitar el doble query del `COUNT(*)` cuando no hubo truncamiento
- [x] #3 **decidido: (A) re-cablear validación** (consistente con
      `tablerillos.md` §6.3, que documenta `validated`/`columns_schema`/
      `parameters_schema`). De paso se resolvió que JSONB rompía
      `SQLModel.metadata.create_all` sobre SQLite en tests (`JSONVariant`,
      `app/core/db_types.py`).
- [x] #8 extraer `_make_conninfo` compartido (`app/core/db_external.py`)
- [x] #9 `SCAN` en vez de `KEYS`; `except` acotado a `RedisError`
- [x] #10 corregir comentarios de auth (`app/main.py`)
- [x] #11 slug/connection read-only en edición de dataset
- [x] #12 auto-preview al editar gráfica
- [ ] #13 (futuro) pooling para dashboard público — sigue pendiente, fuera de
      alcance de esta rama
- [x] #14 `.gitignore` para `jalisco.gpkg` y `ui/`
