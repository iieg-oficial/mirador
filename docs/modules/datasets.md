# Módulo: Datasets

**Ruta backend:** `backend/app/modules/datasets/`
**Endpoints:** `/api/admin/datasets/*`
**Frontend:** `frontend/src/features/datasets/`
**Estado:** Implementado ✅

---

## Responsabilidad

El módulo de datasets es el segundo eslabón de la cadena de datos: `Connection → **Dataset** → Chart → Dashboard`. Permite a los administradores guardar consultas SQL como datasets reutilizables que sirven como fuente de datos para gráficas y dashboards. Un dataset no es una tabla copiada, sino una consulta parametrizable que se ejecuta en tiempo real contra la BD de origen.

Incluye un **playground SQL** que permite ejecutar consultas ad-hoc contra cualquier conexión registrada, con preview de resultados limitados, conteo total de registros y estadísticas de ejecución, sin necesidad de guardar el dataset primero.

---

## Archivos

| Archivo | Rol |
|---|---|
| `models.py` | Modelo SQLModel `Dataset` con estados y campos JSONB para esquemas inferidos |
| `schemas.py` | Schemas Pydantic para CRUD (`DatasetCreate`, `DatasetUpdate`, `DatasetRead`) y ejecución (`PlaygroundRequest`, `PreviewRequest`, `PreviewResult`) |
| `service.py` | CRUD, validación activa contra BD real, ejecución de queries con defensa en capas |
| `router.py` | 7 endpoints: CRUD + `/validate` + `/preview` + `/playground` |
| `app/core/sql_guard.py` | Módulo transversal de validación SQL (comparte con futuros módulos que ejecuten queries) |

---

## Modelo de datos

```python
class DatasetStatus(str, enum.Enum):
    draft = "draft"          # recién creado, sin validar
    validated = "validated"  # SQL válido + columnas inferidas
    published = "published"  # disponible para gráficas y dashboards
    archived = "archived"    # baja lógica (nunca se borra)

class Dataset(UUIDAuditBase, table=True):
    connection_id: uuid.UUID          # FK a connections.id
    name: str                         # max 120 chars, indexado
    slug: str                         # único, solo [a-z0-9_-]
    description: str | None           # max 500 chars
    sql_query: str                    # TEXT sin límite (Column(Text))
    parameters_schema: dict | None    # JSONB: {"params": [{"name": "municipio_id"}, ...]}
    columns_schema: dict | None       # JSONB: {"columns": [{"name": "col", "data_type": "int4"}]}
    cache_ttl_seconds: int            # default 300 (reservado para caché futura)
    max_rows: int                     # default 1000, máx 50 000
    status: DatasetStatus             # default draft
    # heredado de UUIDAuditBase:
    # id, created_at, updated_at, created_by (sub Minerva), created_by_email
```

---

## API

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/datasets` | `datasets.view` | Lista todos los datasets no archivados |
| `POST` | `/api/admin/datasets` | `datasets.create` | Crea dataset; valida SQL con `sql_guard` antes de persistir |
| `GET` | `/api/admin/datasets/{id}` | `datasets.view` | Obtiene un dataset por ID |
| `PUT` | `/api/admin/datasets/{id}` | `datasets.update` | Actualiza campos; si cambia `sql_query` vuelve a pasar por `sql_guard` |
| `DELETE` | `/api/admin/datasets/{id}` | `datasets.delete` | Baja lógica: cambia status a `archived` |
| `POST` | `/api/admin/datasets/{id}/validate` | `datasets.update` | Ejecuta `LIMIT 0` contra la BD real, infiere columnas y parámetros, cambia status a `validated` |
| `POST` | `/api/admin/datasets/{id}/preview` | `datasets.view` | Ejecuta el SQL del dataset guardado con sus `max_rows`, devuelve `PreviewResult` |
| `POST` | `/api/admin/datasets/playground` | `datasets.create` | Ejecución ad-hoc: recibe `connection_id` + `sql` + `params` + `max_rows`, sin guardar |

---

## Guardia SQL (`app/core/sql_guard.py`)

`validate_sql(sql)` aplica defensa en capas antes de cualquier ejecución (detalle
completo en `docs/security.md`):

1. **Parser sqlglot** (`dialect="postgres"`) — un solo statement, raíz `SELECT` o
   `WITH … SELECT` (CTEs); rechaza `SELECT ... INTO`.
2. **Detección de escritura por AST** — recorre todo el árbol y rechaza cualquier nodo
   `INSERT/UPDATE/DELETE/MERGE/DROP/CREATE/ALTER/TRUNCATE/GRANT/COPY` o `Command`
   (cubre CTEs con escritura). A diferencia de una blacklist de keywords sobre texto
   crudo, no rechaza SELECTs legítimos con columnas llamadas `owner`, `update`, etc.
3. **Blacklist acotada a funciones peligrosas** (por patrón de llamada `func(`, no por
   nombre de identificador): `pg_read_file`, `pg_write_file`, `pg_execute_server_program`,
   `lo_import`, `lo_export`, `dblink`, entre otras.

Límite adicional: máximo 10 000 caracteres por query.

---

## Ejecución de queries (`service.run_query`)

Cada ejecución contra la BD externa sigue este flujo:

1. `validate_sql()` — rechaza todo lo que no sea SELECT.
2. Conversión de parámetros: `:nombre` → `%(nombre)s` (bind variables de psycopg, sin concatenación de strings).
3. Conexión psycopg con `conn.read_only = True` y `SET statement_timeout = 15000`.
4. Ejecución con `LIMIT max_rows + 1` para detectar truncamiento sin cargar filas extra.
5. `SELECT COUNT(*) FROM (<query>) AS _cnt` en la misma transacción para obtener el total real (best-effort: si falla, se omite sin bloquear la respuesta).
6. Respuesta `PreviewResult`: `columns`, `rows`, `total_rows`, `truncated`, `elapsed_ms`.

**Motores soportados:** `postgresql`, `postgis`. DuckDB devuelve error 422.

---

## Frontend

### Componentes

| Archivo | Descripción |
|---|---|
| `DatasetsPage.tsx` | Página principal: playground SQL inline (selector de conexión, editor, `ResultTable` con estadísticas y botón "Descargar CSV") + tab de datasets guardados |
| `DatasetForm.tsx` | Modal para crear/editar dataset; genera slug automático desde el nombre |

`SqlPlayground.tsx` existe en el árbol pero es código muerto (nadie lo importa): el
playground real vive inline en `DatasetsPage.tsx`.

### Flujo de uso típico

1. Usuario abre **Playground SQL**, selecciona conexión y escribe `SELECT`.
2. Pulsa **Ejecutar** (o `Ctrl+Enter`). La tabla muestra filas + "X de Y registros / N columnas / Z ms".
3. Si el resultado es útil, pulsa **Guardar como dataset** → abre `DatasetForm` con SQL y conexión precargados.
4. Rellena nombre/slug/descripción y guarda → aparece en el tab "Datasets guardados" con estado `draft`.
5. Desde la lista, pulsa el ícono de validación ✓ → el backend ejecuta `LIMIT 0` e infiere columnas; status cambia a `validated`.

### TanStack Query

```typescript
// Playground: mutación directa (no cachea — cada ejecución es ad-hoc)
const mutation = useMutation({ mutationFn: () => runPlayground({ ... }) })

// Lista de datasets: query con invalidación tras guardar/editar/archivar
const { data } = useQuery({ queryKey: ['datasets'], queryFn: listDatasets })

// Validar: actualización optimista del cache
const validateMutation = useMutation({
  mutationFn: validateDataset,
  onSuccess: (updated) => qc.setQueryData(['datasets'], prev =>
    prev?.map(d => d.id === updated.id ? updated : d)
  ),
})
```

---

## Migración

**Archivo:** `backend/alembic/versions/0002_datasets.py`  
**Revisa:** `0001_initial` (tabla `connections`)

Crea la tabla `datasets` con:
- `sql_query TEXT` (sin límite de longitud)
- `parameters_schema JSONB`, `columns_schema JSONB` (nullable, se rellenan al validar)
- ENUM `datasetstatus` nativo de PostgreSQL
- FK a `connections.id`
- Índices en `connection_id`, `created_by`, `name`; índice único en `slug`

---

## Seguridad

- **SQL guard obligatorio:** `validate_sql()` se llama en `create_dataset`, `update_dataset` (si cambia el SQL) y en `run_query` antes de cualquier ejecución. No hay ruta para ejecutar SQL sin pasar por la guardia.
- **Solo lectura:** `conn.read_only = True` en todas las conexiones a BD externas. No se puede modificar datos aunque el SQL guard fallara.
- **Sin concatenación:** los parámetros de usuario nunca se interpolan en el string SQL; se pasan siempre como bind variables psycopg (`%(nombre)s`).
- **Timeout:** `statement_timeout = 15 000 ms` en cada ejecución. Queries lentas se cortan antes de que saturen la BD.
- **El SQL nunca se ejecuta en la BD interna de Tablerillos.** Se ejecuta únicamente en la BD externa referenciada por `connection_id`, con las credenciales cifradas con Fernet de esa conexión.
- **Baja lógica:** los datasets archivados no se borran; conservan auditoría de quién los creó.
- **Resiliencia:** si la BD externa no está disponible, `_connect` (punto único de conexión en `service.py`) traduce `psycopg.OperationalError` a **503** con mensaje claro, en vez de dejar que preview/playground/validate terminen en un 502 genérico de "error al ejecutar".

---

## Variables de entorno relevantes

Este módulo no introduce variables de entorno propias. Hereda:

| Variable | Descripción |
|---|---|
| `SECRET_ENCRYPTION_KEY` | Clave Fernet para descifrar las contraseñas de las conexiones que usa al ejecutar queries |
