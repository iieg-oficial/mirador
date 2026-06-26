# Tablerillos — Manual Técnico y Contexto de Implementación

## 1. Descripción general del proyecto

**Tablerillos** es un sistema de Business Intelligence institucional para el IIEG. Su objetivo es reemplazar y evolucionar el proyecto anterior llamado **Cuadernillos Municipales**, el cual consistía en reportes extensos de estadística por municipio del estado de Jalisco.

La nueva plataforma debe permitir construir dashboards web interactivos, exportables y reutilizables, con énfasis en visualización municipal. En lugar de generar únicamente PDFs estáticos por municipio, Tablerillos debe permitir que administradores creen datasets, indicadores, gráficas y tableros desde una interfaz visual, mientras que usuarios públicos puedan consultar la información en una página web.

El sistema debe contemplar dos grandes perfiles de uso:

1. **Gestores / Administradores**

   * Gestionan conexiones a bases de datos.
   * Crean datasets a partir de queries SQL.
   * Definen indicadores, KPIs y métricas.
   * Construyen gráficas a partir de datasets.
   * Diseñan dashboards en un canvas visual.
   * Insertan textos en Markdown.
   * Configuran filtros globales, especialmente por municipio.
   * Publican tableros para consulta pública.
   * Versionan dashboards y controlan su estado: borrador, revisión, publicado, archivado.

2. **Visitantes / Usuarios públicos**

   * Consultan dashboards publicados.
   * Filtran información por municipio, región, año, tema u otras dimensiones.
   * Exportan gráficas.
   * Exportan reportes completos.
   * Navegan entre tableros temáticos o municipales.
   * Consultan información estadística sin requerir autenticación.

---

## 2. Objetivo funcional

Tablerillos debe permitir pasar de un modelo de reporte estático a un modelo de BI institucional dinámico.

El sistema debe permitir:

* Crear tableros municipales reutilizables.
* Usar un mismo dashboard como plantilla para diferentes municipios.
* Definir filtros globales que afecten múltiples gráficas.
* Guardar datasets como consultas parametrizables.
* Generar KPIs y tarjetas resumen.
* Construir reportes narrativos con texto Markdown.
* Publicar dashboards públicos.
* Exportar vistas completas como PDF.
* Exportar visualizaciones individuales como imagen.
* Mantener trazabilidad de cambios y publicaciones.

---

## 3. Stack tecnológico propuesto

### Backend

* **Python 3.12+**
* **FastAPI**
* **SQLModel o SQLAlchemy**
* **Alembic**
* **PostgreSQL**
* **PostGIS**, si se manejarán capas geográficas municipales
* **Redis**, para caché de resultados y jobs
* **Celery, Dramatiq o RQ**, para tareas pesadas
* **DuckDB**, opcional para procesamiento analítico local o archivos Parquet
* **Pydantic Settings**, para configuración
* **httpx**, para integraciones externas
* **pytest**, para pruebas

### Frontend

* **React**
* **TypeScript**
* **Vite**
* **TanStack Query**, para manejo de estado de servidor
* **Zustand**, para estado local del editor/canvas
* **React Router**
* **Tailwind CSS**
* **shadcn/ui** o componentes propios institucionales
* **React Hook Form + Zod**, para formularios y validación
* **React-Grid-Layout**, para el canvas de dashboards
* **Plotly.js o Apache ECharts**, para visualizaciones
* **MapLibre GL JS**, para mapas
* **deck.gl**, para visualización geoespacial avanzada

### Motor de gráficas recomendado

Para el MVP se recomienda iniciar con **Plotly.js usando react-plotly.js**, porque permite crear visualizaciones interactivas a partir de objetos JSON y tiene una curva de adopción razonable.

A mediano plazo, considerar agregar soporte para **Apache ECharts** como segundo renderer, especialmente si los dashboards públicos contienen muchas gráficas o se necesita mejor rendimiento en navegador.

La arquitectura debe permitir que una gráfica se guarde como una especificación JSON independiente del renderer. Por ejemplo:

* `renderer = "plotly"`
* `renderer = "echarts"`
* `renderer = "vega_lite"`

Esto permitirá migrar o soportar múltiples motores sin rehacer todo el sistema.

---

## 4. Decisiones técnicas principales

### 4.1 No usar Gradio como motor principal

Gradio no debe usarse como motor principal de Tablerillos. Puede servir para prototipos internos, pruebas rápidas o demos de modelos de IA, pero no para un sistema institucional de BI público con:

* autenticación,
* roles,
* permisos,
* dashboards versionados,
* canvas editable,
* publicación pública,
* exportación formal,
* trazabilidad,
* caché,
* filtros complejos,
* seguridad en SQL,
* control institucional de diseño.

El frontend debe construirse en React y el backend en FastAPI.

---

### 4.2 Guardar dashboards como configuración, no como HTML

Un dashboard no debe guardarse como HTML renderizado. Debe guardarse como una estructura JSON que describa:

* widgets,
* posición,
* tamaño,
* tipo de widget,
* dataset asociado,
* filtros aplicables,
* configuración visual,
* configuración de exportación,
* textos Markdown,
* KPIs,
* versión,
* estado de publicación.

Ejemplo conceptual:

```json
{
  "dashboard_id": "uuid",
  "title": "Tablero municipal",
  "slug": "tablero-municipal",
  "layout": [
    {
      "id": "widget_1",
      "type": "chart",
      "x": 0,
      "y": 0,
      "w": 6,
      "h": 4,
      "chart_id": "uuid"
    },
    {
      "id": "widget_2",
      "type": "markdown",
      "x": 6,
      "y": 0,
      "w": 6,
      "h": 2,
      "content": "## Indicadores principales"
    }
  ],
  "filters": [
    {
      "name": "municipio",
      "type": "select",
      "source": "catalog.municipios",
      "required": true
    }
  ]
}
```

---

### 4.3 Separar dataset, indicador, gráfica y dashboard

No mezclar conceptos.

El sistema debe manejar estas entidades por separado:

* **Connection**: conexión a base de datos.
* **Dataset**: consulta SQL guardada.
* **Metric / Indicator**: definición de cálculo o KPI.
* **Chart**: visualización basada en un dataset.
* **Dashboard**: canvas compuesto por widgets.
* **Dashboard Version**: snapshot publicable del dashboard.
* **Dashboard Publication**: versión publicada y visible al público.

Esto permitirá reutilizar un mismo dataset en varias gráficas y una misma gráfica en distintos dashboards.

---

## 5. Arquitectura general

### 5.1 Componentes principales

```text
                         ┌────────────────────────────┐
                         │        Visitantes           │
                         │  Dashboards públicos web    │
                         └──────────────┬─────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend React                           │
│                                                                  │
│  ┌─────────────────────┐       ┌──────────────────────────────┐  │
│  │ Admin Studio         │       │ Public Dashboard Viewer       │  │
│  │ - conexiones         │       │ - filtros públicos            │  │
│  │ - datasets           │       │ - visualización               │  │
│  │ - gráficas           │       │ - exportaciones               │  │
│  │ - canvas editor      │       │ - navegación municipal        │  │
│  └──────────┬──────────┘       └──────────────┬───────────────┘  │
└─────────────┼─────────────────────────────────┼──────────────────┘
              │                                 │
              ▼                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend                          │
│                                                                  │
│  ┌─────────────────────┐  ┌───────────────────────────────────┐  │
│  │ Auth / RBAC          │  │ Public API                         │  │
│  └─────────────────────┘  └───────────────────────────────────┘  │
│  ┌─────────────────────┐  ┌───────────────────────────────────┐  │
│  │ Dataset Service      │  │ Query Execution Service            │  │
│  └─────────────────────┘  └───────────────────────────────────┘  │
│  ┌─────────────────────┐  ┌───────────────────────────────────┐  │
│  │ Chart Service        │  │ Dashboard Service                  │  │
│  └─────────────────────┘  └───────────────────────────────────┘  │
│  ┌─────────────────────┐  ┌───────────────────────────────────┐  │
│  │ Export Service       │  │ Audit / Versioning Service         │  │
│  └─────────────────────┘  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────────┬────────────────────┘
               │                              │
               ▼                              ▼
┌────────────────────────────┐     ┌───────────────────────────────┐
│ PostgreSQL Tablerillos DB  │     │ Redis / Cache / Queue          │
│ - metadata                 │     │ - query cache                  │
│ - users                    │     │ - export jobs                  │
│ - dashboards               │     │ - async tasks                  │
│ - charts                   │     └───────────────────────────────┘
│ - datasets                 │
│ - audit logs               │
└──────────────┬─────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Fuentes de datos externas                    │
│                                                                  │
│  PostgreSQL / PostGIS / Data Warehouse / APIs / CSV / Parquet     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Módulos funcionales

## 6.1 Módulo de autenticación y permisos

### Objetivo

Controlar el acceso administrativo y permitir consulta pública de dashboards publicados.

### Recomendación

Integrar con **Minerva** si ya existe como sistema institucional de autenticación y gestión de accesos.

### Roles sugeridos

* **Superadmin**

  * Administra todo el sistema.
  * Gestiona conexiones.
  * Gestiona usuarios.
  * Puede publicar cualquier dashboard.

* **Administrador BI**

  * Crea datasets.
  * Crea gráficas.
  * Crea dashboards.
  * Publica tableros.

* **Editor**

  * Edita dashboards y visualizaciones.
  * No gestiona conexiones sensibles.
  * Puede enviar a revisión.

* **Revisor**

  * Revisa contenido antes de publicación.
  * Aprueba o rechaza dashboards.

* **Visitante**

  * Usuario público.
  * No requiere login.
  * Solo puede ver dashboards publicados.

### Permisos base

* `connections:create`
* `connections:read`
* `connections:update`
* `connections:delete`
* `datasets:create`
* `datasets:read`
* `datasets:update`
* `datasets:delete`
* `charts:create`
* `charts:read`
* `charts:update`
* `charts:delete`
* `dashboards:create`
* `dashboards:read`
* `dashboards:update`
* `dashboards:delete`
* `dashboards:publish`
* `dashboards:review`
* `exports:create`
* `audit:read`

---

## 6.2 Módulo de conexiones a bases de datos

### Objetivo

Permitir registrar conexiones a diferentes fuentes de datos.

### Alcance MVP

Soportar inicialmente:

* PostgreSQL
* PostGIS
* DuckDB local opcional
* Archivos CSV/Parquet como fuente futura

### Reglas

* Las credenciales no deben guardarse en texto plano.
* Las conexiones usadas para consulta deben ser de solo lectura.
* Cada conexión debe poder probarse desde el panel administrativo.
* Cada conexión debe tener owner/responsable.
* Cada conexión debe tener estado:

  * activa,
  * inactiva,
  * error,
  * archivada.

### Campos sugeridos

* `id`
* `name`
* `description`
* `engine`
* `host`
* `port`
* `database`
* `username`
* `encrypted_password`
* `ssl_enabled`
* `read_only`
* `created_by`
* `created_at`
* `updated_at`

---

## 6.3 Módulo de datasets

### Objetivo

Permitir que gestores creen datasets reutilizables a partir de SQL.

Un dataset es una consulta SQL guardada, parametrizable y validada.

### Ejemplo

```sql
SELECT
    municipio,
    anio,
    poblacion_total,
    hombres,
    mujeres
FROM mart.poblacion_municipal
WHERE municipio_id = :municipio_id
  AND anio BETWEEN :anio_inicio AND :anio_fin;
```

### Reglas

* Solo permitir consultas `SELECT`.
* Bloquear `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`.
* Permitir parámetros nombrados.
* Validar query antes de guardar.
* Guardar columnas resultantes.
* Inferir tipos de datos.
* Permitir vista previa limitada.
* Cachear resultados.
* Registrar auditoría de ejecución.
* Limitar número máximo de filas.
* Permitir timeout por query.

### Estados de dataset

* `draft`
* `validated`
* `published`
* `archived`

### Campos sugeridos

* `id`
* `connection_id`
* `name`
* `slug`
* `description`
* `sql_query`
* `parameters_schema`
* `columns_schema`
* `cache_ttl_seconds`
* `max_rows`
* `status`
* `created_by`
* `created_at`
* `updated_at`

---

## 6.4 Módulo de indicadores y KPIs

### Objetivo

Permitir construir indicadores reutilizables a partir de datasets.

### Tipos de indicador

* Valor único
* Porcentaje
* Variación absoluta
* Variación porcentual
* Ranking
* Promedio
* Conteo
* Suma
* Razón
* Indicador compuesto

### Ejemplos

* Población total
* Porcentaje de mujeres
* Tasa de crecimiento poblacional
* Ranking estatal por valor agregado censal bruto
* Viviendas habitadas
* Porcentaje de acceso a internet
* Tasa de desocupación

### Campos sugeridos

* `id`
* `dataset_id`
* `name`
* `description`
* `calculation_type`
* `value_field`
* `group_by_field`
* `format`
* `unit`
* `prefix`
* `suffix`
* `decimals`
* `comparison_config`
* `created_by`
* `created_at`

---

## 6.5 Módulo de gráficas

### Objetivo

Permitir crear visualizaciones a partir de datasets.

### Tipos de gráfica MVP

* Barras
* Líneas
* Área
* Pastel / Dona
* Dispersión
* Tabla
* Tarjeta KPI
* Ranking
* Mapa coroplético municipal
* Serie temporal
* Comparativo entre municipios

### Modelo recomendado

Cada gráfica debe guardar:

* dataset asociado,
* renderer,
* tipo de gráfica,
* mapeo de campos,
* configuración visual,
* configuración de filtros,
* configuración de exportación.

### Ejemplo conceptual

```json
{
  "renderer": "plotly",
  "chart_type": "bar",
  "dataset_id": "uuid",
  "field_mapping": {
    "x": "anio",
    "y": "poblacion_total",
    "color": "municipio"
  },
  "options": {
    "title": "Población total por año",
    "xaxis": {
      "title": "Año"
    },
    "yaxis": {
      "title": "Población"
    }
  }
}
```

### Campos sugeridos

* `id`
* `dataset_id`
* `name`
* `slug`
* `description`
* `renderer`
* `chart_type`
* `field_mapping`
* `visual_config`
* `default_filters`
* `created_by`
* `created_at`
* `updated_at`

---

## 6.6 Módulo de dashboards

### Objetivo

Permitir construir tableros a partir de widgets en un canvas visual.

### Widgets soportados

* Gráfica
* KPI
* Markdown
* Texto enriquecido
* Imagen
* Tabla
* Separador
* Mapa
* Contenedor / sección
* Filtro local
* Filtro global
* Botón de exportación
* Ficha municipal

### Canvas

El canvas debe permitir:

* arrastrar widgets,
* redimensionar widgets,
* alinear en grid,
* configurar layout responsivo,
* duplicar widgets,
* eliminar widgets,
* editar configuración,
* previsualizar dashboard,
* guardar borrador,
* publicar versión.

### Layout recomendado

Usar un sistema de grid responsivo con columnas, por ejemplo:

* desktop: 12 columnas
* tablet: 8 columnas
* mobile: 4 columnas

Cada widget debe tener:

* `x`
* `y`
* `w`
* `h`
* `minW`
* `minH`
* `static`
* `breakpoint`

---

## 6.7 Módulo de filtros

### Objetivo

Permitir filtros globales y locales que afecten datasets, gráficas y dashboards.

### Filtros prioritarios

* Municipio
* Región
* Año
* Periodo
* Tema
* Sexo
* Grupo de edad
* Sector
* Fuente
* Variable

### Reglas

* El filtro de municipio debe ser central.
* Un dashboard municipal debe poder recibir `municipio_id` en URL.
* Los filtros deben poder mapearse a parámetros SQL.
* Un filtro global puede afectar varias gráficas.
* Una gráfica puede ignorar filtros específicos si así se configura.
* El sistema debe soportar valores por defecto.

### Ejemplo de URL pública

```text
/tableros/cuadernillo-municipal?municipio_id=039
```

O:

```text
/municipios/guadalajara/tablero-general
```

---

## 6.8 Módulo de publicación

### Objetivo

Controlar qué dashboards son visibles al público.

### Estados sugeridos

* `draft`
* `in_review`
* `approved`
* `published`
* `archived`

### Flujo sugerido

1. Editor crea dashboard.
2. Editor envía a revisión.
3. Revisor revisa contenido.
4. Revisor aprueba o rechaza.
5. Administrador publica.
6. Visitantes pueden consultar la versión publicada.

### Importante

La versión publicada debe ser un snapshot estable. Si un administrador edita el dashboard después de publicarlo, los cambios no deben afectar la versión pública hasta que se publique una nueva versión.

---

## 6.9 Módulo de exportación

### Objetivo

Permitir exportar gráficas y reportes.

### Exportaciones MVP

* Exportar gráfica como PNG.
* Exportar tabla como CSV.
* Exportar dashboard como PDF.
* Exportar dashboard filtrado por municipio como PDF.
* Exportar datos de una gráfica como CSV o XLSX.

### Exportación de dashboard completo

Recomendación técnica:

* Usar Playwright en backend o worker.
* Renderizar la ruta pública/privada del dashboard.
* Aplicar filtros.
* Generar PDF desde Chromium headless.
* Guardar resultado temporalmente.
* Devolver archivo al usuario.

### Ejemplo

```text
POST /api/exports/dashboard/{dashboard_id}

Body:
{
  "format": "pdf",
  "filters": {
    "municipio_id": "039",
    "anio": 2025
  }
}
```

---

## 6.10 Módulo de auditoría

### Objetivo

Registrar acciones importantes del sistema.

### Eventos auditables

* Creación de conexión.
* Edición de conexión.
* Prueba de conexión.
* Creación de dataset.
* Edición de query SQL.
* Ejecución de dataset.
* Creación de gráfica.
* Edición de dashboard.
* Cambio de estado.
* Publicación.
* Exportación.
* Error de query.
* Error de exportación.

### Campos sugeridos

* `id`
* `actor_user_id`
* `action`
* `entity_type`
* `entity_id`
* `before_data`
* `after_data`
* `ip_address`
* `user_agent`
* `created_at`

---

## 7. Modelo de base de datos sugerido

### Tablas principales

```text
users
roles
permissions
user_roles
role_permissions

connections
datasets
dataset_columns
dataset_parameters

metrics
charts

dashboards
dashboard_versions
dashboard_publications
dashboard_widgets

filters
dashboard_filters
chart_filters

exports
audit_logs
query_execution_logs
```

---

## 8. Diseño de API

## 8.1 Auth

```text
GET    /api/auth/me
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/permissions
```

Si se integra con Minerva/OIDC:

```text
GET    /api/auth/oidc/login
GET    /api/auth/oidc/callback
POST   /api/auth/oidc/logout
```

---

## 8.2 Connections

```text
GET    /api/admin/connections
POST   /api/admin/connections
GET    /api/admin/connections/{connection_id}
PUT    /api/admin/connections/{connection_id}
DELETE /api/admin/connections/{connection_id}
POST   /api/admin/connections/{connection_id}/test
```

---

## 8.3 Datasets

```text
GET    /api/admin/datasets
POST   /api/admin/datasets
GET    /api/admin/datasets/{dataset_id}
PUT    /api/admin/datasets/{dataset_id}
DELETE /api/admin/datasets/{dataset_id}

POST   /api/admin/datasets/{dataset_id}/validate
POST   /api/admin/datasets/{dataset_id}/preview
POST   /api/admin/datasets/{dataset_id}/execute
GET    /api/admin/datasets/{dataset_id}/columns
```

---

## 8.4 Charts

```text
GET    /api/admin/charts
POST   /api/admin/charts
GET    /api/admin/charts/{chart_id}
PUT    /api/admin/charts/{chart_id}
DELETE /api/admin/charts/{chart_id}

POST   /api/admin/charts/{chart_id}/preview
```

---

## 8.5 Dashboards

```text
GET    /api/admin/dashboards
POST   /api/admin/dashboards
GET    /api/admin/dashboards/{dashboard_id}
PUT    /api/admin/dashboards/{dashboard_id}
DELETE /api/admin/dashboards/{dashboard_id}

POST   /api/admin/dashboards/{dashboard_id}/versions
GET    /api/admin/dashboards/{dashboard_id}/versions
POST   /api/admin/dashboards/{dashboard_id}/submit-review
POST   /api/admin/dashboards/{dashboard_id}/approve
POST   /api/admin/dashboards/{dashboard_id}/publish
POST   /api/admin/dashboards/{dashboard_id}/archive
```

---

## 8.6 Public API

```text
GET    /api/public/dashboards
GET    /api/public/dashboards/{slug}
GET    /api/public/dashboards/{slug}/data
POST   /api/public/dashboards/{slug}/query

GET    /api/public/municipios
GET    /api/public/municipios/{municipio_slug}
GET    /api/public/municipios/{municipio_slug}/dashboards
```

---

## 8.7 Exports

```text
POST   /api/exports/charts/{chart_id}
POST   /api/exports/dashboards/{dashboard_id}
GET    /api/exports/{export_id}
GET    /api/exports/{export_id}/download
```

---

## 9. Seguridad

## 9.1 Seguridad en conexiones

* Usar usuarios de base de datos de solo lectura.
* No permitir conexiones con usuarios superadmin.
* Cifrar credenciales.
* No exponer cadenas de conexión al frontend.
* Registrar auditoría de pruebas de conexión.
* Permitir desactivar conexiones.

## 9.2 Seguridad en SQL

* Permitir únicamente consultas `SELECT`.
* Bloquear múltiples statements.
* Bloquear comentarios peligrosos si aplica.
* Usar parser SQL si es posible.
* Usar parámetros, no concatenación.
* Aplicar timeout.
* Aplicar límite máximo de filas.
* Aplicar caché.
* Registrar queries ejecutadas.
* No permitir que usuarios públicos manden SQL directo.

## 9.3 Seguridad en API pública

* Solo exponer dashboards publicados.
* No exponer nombres internos de conexiones.
* No exponer queries SQL completas públicamente.
* Rate limiting.
* Caché HTTP.
* Validación estricta de filtros.
* Sanitizar Markdown.
* Evitar XSS.
* CORS controlado.

## 9.4 Seguridad en Markdown

El widget Markdown debe sanitizar HTML. No permitir scripts, iframes arbitrarios ni handlers como `onclick`.

---

## 10. Estructura propuesta del repositorio

```text
tablerillos/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── database.py
│   │   │   └── permissions.py
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── connections/
│   │   │   ├── datasets/
│   │   │   ├── metrics/
│   │   │   ├── charts/
│   │   │   ├── dashboards/
│   │   │   ├── filters/
│   │   │   ├── exports/
│   │   │   └── audit/
│   │   ├── workers/
│   │   ├── shared/
│   │   └── tests/
│   ├── alembic/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── routes/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   ├── public/
│   │   │   ├── dashboards/
│   │   │   ├── charts/
│   │   │   ├── datasets/
│   │   │   ├── connections/
│   │   │   └── exports/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── types/
│   ├── package.json
│   └── Dockerfile
│
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── scripts/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── database.md
│   ├── security.md
│   └── user-flows.md
│
└── README.md
```

---

## 11. Frontend — vistas necesarias

## 11.1 Vistas públicas

### Home pública

Debe mostrar:

* Nombre del sistema.
* Descripción breve.
* Buscador de tableros.
* Acceso por municipio.
* Acceso por tema.
* Dashboards destacados.

### Selector municipal

Debe permitir:

* Buscar municipio.
* Seleccionar municipio.
* Ver dashboards disponibles para ese municipio.
* Entrar a un tablero municipal.

### Visor público de dashboard

Debe incluir:

* Título.
* Descripción.
* Filtros globales.
* Canvas renderizado.
* Botones de exportación.
* Fecha de actualización.
* Fuente de datos.
* Notas metodológicas.
* Link para compartir.

---

## 11.2 Vistas administrativas

### Admin Home

Debe mostrar:

* Dashboards recientes.
* Datasets recientes.
* Estado de conexiones.
* Pendientes de revisión.
* Últimas publicaciones.
* Últimos errores de query/exportación.

### Gestor de conexiones

Debe permitir:

* Crear conexión.
* Probar conexión.
* Editar conexión.
* Desactivar conexión.
* Ver estado.

### Gestor de datasets

Debe permitir:

* Crear dataset.
* Elegir conexión.
* Escribir SQL.
* Definir parámetros.
* Validar SQL.
* Previsualizar datos.
* Guardar columnas detectadas.
* Publicar dataset.

### Gestor de gráficas

Debe permitir:

* Elegir dataset.
* Elegir tipo de gráfica.
* Mapear columnas.
* Configurar títulos/ejes/colores.
* Previsualizar.
* Guardar.

### Editor de dashboard

Debe permitir:

* Crear dashboard.
* Agregar widgets.
* Mover widgets.
* Redimensionar widgets.
* Configurar filtros.
* Configurar vista responsiva.
* Previsualizar dashboard.
* Guardar borrador.
* Enviar a revisión.
* Publicar.

### Revisión y publicación

Debe permitir:

* Ver cambios.
* Comparar versión anterior vs nueva.
* Aprobar.
* Rechazar.
* Publicar.
* Archivar.

---

## 12. Flujo principal de creación de dashboard

1. Administrador crea conexión a base de datos.
2. Administrador crea dataset con SQL.
3. Sistema valida query.
4. Sistema detecta columnas.
5. Administrador crea gráfica usando dataset.
6. Administrador configura campos y estilos.
7. Administrador crea dashboard.
8. Administrador coloca gráfica en canvas.
9. Administrador agrega Markdown, KPIs y filtros.
10. Administrador previsualiza.
11. Administrador envía a revisión.
12. Revisor aprueba.
13. Administrador publica.
14. Visitante consulta dashboard.
15. Visitante filtra por municipio.
16. Visitante exporta PDF o gráfica.

---

## 13. Manejo especial de municipios

Tablerillos debe tener un catálogo oficial de municipios de Jalisco.

### Campos sugeridos

* `municipio_id`
* `clave_inegi`
* `nombre`
* `slug`
* `region`
* `geometry`
* `centroid`
* `bbox`

### Uso

* Filtro global.
* Rutas públicas.
* Mapas.
* Exportación PDF por municipio.
* Plantillas de dashboard municipal.

### Rutas sugeridas

```text
/municipios
/municipios/guadalajara
/municipios/guadalajara/cuadernillo
/municipios/zapopan/cuadernillo
```

---

## 14. Exportación tipo Cuadernillo Municipal

La exportación debe permitir generar un PDF por municipio a partir de un dashboard publicado.

### Flujo

1. Usuario selecciona municipio.
2. Sistema carga dashboard publicado.
3. Sistema aplica filtro `municipio_id`.
4. Sistema renderiza página completa.
5. Worker genera PDF con Playwright.
6. Sistema guarda archivo temporal.
7. Usuario descarga PDF.

### Consideraciones

* Incluir portada.
* Incluir fecha de generación.
* Incluir fuentes.
* Incluir notas metodológicas.
* Incluir logo institucional.
* Incluir numeración de páginas.
* Incluir municipio seleccionado.
* Mantener diseño imprimible.

---

## 15. Caché y rendimiento

### Caché de datasets

Cada dataset debe poder definir TTL.

Ejemplo:

* Indicadores anuales: caché 24 horas.
* Datos que cambian poco: caché 7 días.
* Datos administrativos recientes: caché 1 hora.
* Datos de prueba: sin caché.

### Estrategia

* Cachear resultado de query por:

  * dataset_id,
  * parámetros,
  * versión del dataset,
  * usuario/rol si aplica.

### Performance pública

* Precalcular dashboards municipales populares.
* Cachear respuestas públicas.
* Usar paginación en tablas.
* Limitar filas en gráficas.
* Evitar mandar datasets enormes al navegador.
* Agregar agregaciones en SQL.
* Exportaciones pesadas deben ir a workers.

---

## 16. Testing

### Backend

Usar pytest.

Pruebas mínimas:

* Crear conexión.
* Probar conexión mock.
* Crear dataset.
* Validar SQL permitido.
* Rechazar SQL peligroso.
* Ejecutar preview.
* Crear gráfica.
* Crear dashboard.
* Publicar versión.
* Consultar dashboard público.
* Generar export job.

### Frontend

Usar Vitest y Playwright.

Pruebas mínimas:

* Login admin.
* Crear dataset.
* Crear gráfica.
* Agregar widget al canvas.
* Guardar dashboard.
* Ver dashboard público.
* Aplicar filtro municipal.
* Exportar PDF.

---

## 17. MVP sugerido

El MVP no debe intentar resolver todo el BI institucional desde el primer sprint.

### MVP 1 — Base funcional

Debe incluir:

* Backend FastAPI.
* Frontend React.
* Login administrativo básico.
* Roles simples.
* CRUD de conexiones PostgreSQL.
* CRUD de datasets SQL.
* Validación básica de SQL solo SELECT.
* Preview de dataset.
* CRUD de gráficas Plotly.
* Editor simple de dashboard con React-Grid-Layout.
* Widget de gráfica.
* Widget Markdown.
* Filtro global por municipio.
* Publicación simple.
* Vista pública de dashboard.
* Exportación básica a PDF.

### MVP 2 — Robustez institucional

Agregar:

* Versionado formal.
* Flujo revisión/aprobación.
* Auditoría.
* Caché con Redis.
* Workers para exportación.
* Más tipos de gráficas.
* Mapas municipales.
* Sanitización avanzada de Markdown.
* Integración con Minerva/OIDC.
* Notas metodológicas.
* Fuentes por visualización.

### MVP 3 — BI avanzado

Agregar:

* Capa semántica.
* Indicadores reutilizables.
* Catálogo de variables.
* Plantillas municipales.
* Exportación masiva de PDFs por municipio.
* Comparador entre municipios.
* Programación de actualizaciones.
* Alertas de errores.
* Integración con Data Warehouse institucional.
* Soporte para ECharts y/o Vega-Lite.
* Soporte para archivos Parquet/DuckDB.

---

## 18. Principios de implementación

* No usar datos dummy salvo seeds mínimos.
* No mezclar frontend público con panel administrativo de forma insegura.
* El SQL nunca debe ejecutarse desde el frontend.
* Los visitantes nunca deben enviar SQL.
* Toda gráfica debe ser reproducible desde su dataset y configuración.
* Todo dashboard publicado debe ser versionado.
* Todo cambio sensible debe auditarse.
* Las conexiones deben ser de solo lectura.
* El sistema debe pensar primero en municipio como filtro central.
* La exportación a PDF debe usar el mismo dashboard renderizado en web.
* La arquitectura debe permitir agregar nuevos motores de gráficas sin rehacer el sistema.

---

## 19. Prompt para Claude Code

Eres Claude Code trabajando sobre un proyecto nuevo llamado **Tablerillos**.

Necesito que inicialices e implementes la base de un sistema de Business Intelligence institucional para el IIEG. El sistema reemplazará y evolucionará los antiguos **Cuadernillos Municipales**, que eran reportes estadísticos extensos por municipio del estado de Jalisco.

El sistema debe tener dos modos principales:

1. **Gestores / Administradores**

   * Panel administrativo.
   * Gestión de conexiones a bases de datos.
   * Creación de datasets desde queries SQL.
   * Validación de SQL solo lectura.
   * Creación de gráficas desde datasets.
   * Creación de dashboards en canvas editable.
   * Widgets de gráfica, KPI y Markdown.
   * Filtros globales, especialmente por municipio.
   * Publicación de dashboards.
   * Exportación de dashboards.

2. **Visitantes públicos**

   * Vista pública de dashboards publicados.
   * Filtros públicos por municipio y año.
   * Exportación de gráficas o reportes.
   * Consulta sin login.

## Stack obligatorio

Backend:

* Python 3.12+
* FastAPI
* SQLAlchemy o SQLModel
* Alembic
* PostgreSQL
* Pydantic
* pytest

Frontend:

* React
* TypeScript
* Vite
* TanStack Query
* Zustand
* React Router
* Tailwind CSS
* React-Grid-Layout
* Plotly.js o react-plotly.js

Infra:

* Docker
* docker-compose
* PostgreSQL
* Redis opcional para caché/jobs

## Arquitectura esperada

Crear un monorepo con:

```text
tablerillos/
├── backend/
├── frontend/
├── infra/
├── docs/
└── README.md
```

## Requerimientos de backend

Implementar módulos base:

* auth
* users
* connections
* datasets
* charts
* dashboards
* filters
* exports
* audit

Crear modelos iniciales para:

* User
* Role
* Permission
* Connection
* Dataset
* DatasetColumn
* DatasetParameter
* Chart
* Dashboard
* DashboardVersion
* DashboardWidget
* DashboardPublication
* AuditLog
* ExportJob

Crear endpoints iniciales:

* CRUD conexiones.
* Test de conexión.
* CRUD datasets.
* Validación de SQL.
* Preview de dataset.
* CRUD charts.
* CRUD dashboards.
* Publicación básica.
* Consulta pública de dashboard publicado.
* Export job placeholder.

## Reglas de SQL

Implementar validación básica para permitir únicamente `SELECT`.

Bloquear:

* INSERT
* UPDATE
* DELETE
* DROP
* ALTER
* TRUNCATE
* CREATE
* GRANT
* REVOKE
* COPY
* múltiples statements

Toda query debe tener:

* timeout,
* límite máximo de filas,
* parámetros seguros,
* auditoría de ejecución.

## Requerimientos de frontend

Crear dos áreas:

1. `/admin`
2. `/`

En `/admin` crear:

* Dashboard administrativo inicial.
* Pantalla de conexiones.
* Pantalla de datasets.
* Pantalla de charts.
* Editor de dashboards.
* Vista de revisión/publicación básica.

En público crear:

* Home.
* Lista de dashboards publicados.
* Selector de municipio.
* Visor de dashboard público.

El editor de dashboards debe usar React-Grid-Layout.

Los widgets iniciales deben ser:

* ChartWidget
* MarkdownWidget
* KpiWidget

Las gráficas deben renderizarse con Plotly usando configuración JSON.

## Filtro municipal

Crear un catálogo inicial de municipios con estructura preparada, aunque no se carguen los 125 municipios todavía.

El sistema debe estar preparado para recibir filtros como:

```json
{
  "municipio_id": "039",
  "anio": 2025
}
```

El dashboard público debe poder renderizarse con filtros en query params.

## Exportación

Implementar inicialmente un placeholder funcional de exportación:

* Crear job de exportación.
* Guardar estado.
* Preparar estructura para Playwright/worker en una fase posterior.

Estados:

* pending
* running
* completed
* failed

## Documentación

Crear documentación en `/docs`:

* `architecture.md`
* `api.md`
* `database.md`
* `security.md`
* `development.md`

## Criterios de calidad

* Código modular.
* Tipado fuerte en frontend.
* Tipado con Pydantic en backend.
* Migraciones con Alembic.
* Variables de entorno.
* Docker compose funcional.
* README con instrucciones para levantar el proyecto.
* Tests mínimos de backend.
* No usar datos dummy masivos.
* Seeds mínimos solo para roles, permisos y un usuario admin local.
* Preparar integración futura con Minerva/OIDC.

## Resultado esperado

Al finalizar, el proyecto debe permitir levantar:

```bash
docker compose up --build
```

Y tener:

* Backend FastAPI funcionando.
* Frontend React funcionando.
* PostgreSQL funcionando.
* Migraciones aplicadas.
* Panel admin inicial.
* CRUD base de conexiones, datasets, charts y dashboards.
* Vista pública básica de dashboard publicado.
* Estructura clara para seguir desarrollando el sistema real.

No implementes funcionalidades de forma superficial si comprometen la arquitectura. Prioriza una base sólida, modular y extensible.
