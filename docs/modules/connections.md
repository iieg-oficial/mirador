# Módulo: Connections (Conexiones a bases de datos)

**Ruta backend:** `backend/app/modules/connections/`  
**Endpoints:** `/api/admin/connections/*`  
**Frontend:** `frontend/src/features/connections/`  
**Estado:** Implementado ✅

---

## Responsabilidad

Permite a los administradores registrar fuentes de datos externas (bases de datos PostgreSQL, PostGIS, DuckDB). Cada `Connection` almacena los datos de acceso con la contraseña cifrada en reposo y nunca expuesta al frontend.

Las conexiones son el primer eslabón de la cadena: `Connection → Dataset → Chart → Dashboard`.

---

## Modelo de datos

```python
class Connection(UUIDAuditBase, table=True):
    name: str                      # nombre legible (ej. "SIGE Producción")
    description: str | None
    engine: ConnectionEngine       # postgresql | postgis | duckdb
    host: str
    port: int                      # default 5432
    database: str
    username: str
    encrypted_password: str        # cifrado con Fernet — NUNCA en claro ni al frontend
    ssl_enabled: bool
    read_only: bool                # default True
    status: ConnectionStatus       # inactiva | activa | error | archivada
    last_test_error: str | None    # diagnóstico de la última prueba fallida
```

`status` es el resultado de la última prueba de conexión, no un estado gestionado por el usuario. La "baja" de una conexión es lógica (status → archivada), no física.

---

## API

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/admin/connections` | `connections.view` | Lista conexiones |
| POST | `/api/admin/connections` | `connections.create` | Crea conexión |
| GET | `/api/admin/connections/{id}` | `connections.view` | Detalle |
| PUT | `/api/admin/connections/{id}` | `connections.update` | Actualiza |
| DELETE | `/api/admin/connections/{id}` | `connections.delete` | Archiva (baja lógica) |
| POST | `/api/admin/connections/{id}/test` | `connections.manage` | Prueba la conexión |
| GET | `/api/admin/connections/{id}/schema` | `connections.view` | Explora el esquema |
| GET | `/api/admin/connections/{id}/schema/{schema}/{objeto}/columns` | `connections.view` | Columnas de un objeto |

---

## Cifrado de credenciales

La contraseña viaja en claro **solo dentro del request HTTP** (TLS en producción). Inmediatamente al crear o actualizar, se cifra con Fernet:

```python
# service.py — al crear
encrypted_password = encrypt_secret(data.password)

# service.py — al probar/explorar
password = decrypt_secret(connection.encrypted_password)
```

`app.core.security` es el único lugar que maneja el secreto en claro. `ConnectionRead` (el schema de respuesta) **nunca incluye** `encrypted_password` ni la cadena de conexión.

`SECRET_ENCRYPTION_KEY` es una clave Fernet de 32 bytes en base64. Si se pierde, todas las contraseñas almacenadas quedan indescriptables.

---

## Prueba de conexión

`POST /{id}/test` abre una conexión real contra la BD externa en modo solo lectura y ejecuta `SELECT 1`:

```python
with psycopg.connect(conninfo) as conn:
    conn.read_only = True
    cur.execute(f"SET statement_timeout = {5000}")
    cur.execute("SELECT 1")
```

- **Éxito** → `status = activa`, `last_test_error = None`
- **Fallo** → `status = error`, `last_test_error = mensaje del driver`
- **Motor no soportado** (DuckDB) → 422 con mensaje descriptivo

Timeout de conexión: 5 segundos. Timeout de statement: 5 segundos.

---

## Explorador de esquema

`GET /{id}/schema` conecta a la BD externa y consulta:

- `information_schema.tables` → tablas y vistas
- `pg_matviews` → vistas materializadas

Excluye los esquemas del sistema (`pg_catalog`, `information_schema`, `pg_toast`). Agrupa los objetos por esquema y devuelve:

```json
{
  "schemas": [
    {
      "name": "public",
      "objects": [
        { "name": "usuarios", "type": "table" },
        { "name": "vista_activos", "type": "view" },
        { "name": "mat_resumen", "type": "materialized_view" }
      ]
    }
  ]
}
```

`GET /{id}/schema/{schema}/{objeto}/columns` usa `pg_attribute` (no `information_schema.columns`) porque este último no cubre vistas materializadas:

```json
[
  { "name": "id", "data_type": "uuid", "nullable": false, "default": "gen_random_uuid()" },
  { "name": "nombre", "data_type": "character varying(120)", "nullable": false, "default": null }
]
```

Ambos endpoints solo soportan PostgreSQL/PostGIS. Para DuckDB devuelven 422.

---

## Frontend

### Componentes

| Archivo | Descripción |
|---|---|
| `ConexionesPage.tsx` | Página principal: lista + panel de exploración |
| `ConexionForm.tsx` | Modal para crear / editar conexión |
| `SchemaExplorer.tsx` | Árbol de esquema con carga lazy de columnas |
| `api.ts` | Funciones fetch hacia el backend |

### Estado del semáforo

El semáforo es visual y combina el `status` del servidor con el estado de mutación local:

| Indicador | Cuándo |
|---|---|
| Gris | `status = inactiva` (sin probar) |
| Verde | `status = activa` |
| Rojo | `status = error` |
| Amarillo pulsante | Mientras `useMutation(testConexion).isPending` |

El estado "amarillo" es puramente UI — nunca se persiste en la BD. Solo existe mientras la llamada HTTP de prueba está en vuelo.

### Flujo de creación

```
Usuario llena ConexionForm
    └── POST /api/admin/connections (con password en claro, TLS)
            └── Backend cifra la contraseña antes de guardar
                    └── invalidateQueries(['conexiones']) → la lista se refresca
```

### Lazy loading del explorador

Cada fila de tabla/vista en `SchemaExplorer` es un componente independiente con su propio `useQuery`:

```typescript
const { data: columns } = useQuery({
  queryKey: ['columns', connectionId, schemaName, obj.name],
  queryFn: () => getColumns(connectionId, schemaName, obj.name),
  enabled: expanded,   // solo carga cuando el usuario expande la fila
  staleTime: 5 * 60 * 1000,
})
```

TanStack Query deduplica peticiones y cachea los resultados mientras la página está abierta.

---

## Migraciones

La tabla `connections` está definida en `alembic/versions/0001_initial_connections.py`. Se crea automáticamente al primer `alembic upgrade head`.

Los ENUMs de PostgreSQL (`connectionengine`, `connectionstatus`) también se crean en la migración y se eliminan explícitamente en el downgrade.

---

## Seguridad

- La contraseña **nunca** aparece en logs, respuestas de la API ni en el frontend.
- DELETE no borra: archiva (`status = archivada`). Las conexiones archivadas quedan fuera de la lista pero los datasets que las referencian mantienen el historial.
- Las conexiones de solo lectura (`read_only = True`) son la configuración recomendada para reducir superficie de ataque desde los datasets.
- El explorador de esquema abre conexiones de solo lectura y sin `autocommit` para minimizar riesgo de efectos secundarios.
