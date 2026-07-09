# Módulo: IA (generación asistida)

**Ruta backend:** `backend/app/modules/ai/`
**Endpoints:** `/api/admin/ai/*`
**Frontend:** — (sin UI todavía; solo el motor)
**Estado:** Implementado ✅ (issue #13)

---

## Responsabilidad

El módulo de IA es el **motor** que traduce lenguaje natural a artefactos del
laboratorio de datos, revalidados siempre en el backend:

- **`/query/generate`**: genera SQL de solo lectura para el playground de datasets,
  a partir del esquema de una conexión.
- **`/charts/generate`**: genera una **ChartSpec 1.0** válida para el constructor de
  gráficas, a partir de la metadata de un dataset.

Es **solo el motor**: no tiene UI, ni chat, ni persistencia de historial, ni
feedback/fine-tuning (fuera de alcance). El frontend consume estos endpoints y
decide cómo mostrarlos.

Principio irrenunciable: **nunca se confía en la IA**. Toda salida del modelo se
revalida en el backend con las mismas defensas del resto del sistema
(`sql_guard.validate_sql`, `parse_spec` + `validate_spec_against_dataset`). Si no
pasa, se responde **422** con el motivo; nunca se devuelve algo sin validar.

---

## Arquitectura: dos capas con inversión de dependencias

| Capa | Archivo | Conoce OpenAI/LangChain |
|---|---|---|
| **Proveedor** | `provider.py` | **Sí** — única pieza acoplada al LLM |
| **Dominio** | `prompts.py` + `service.py` | **No** — depende de la interfaz `AIProvider` |

- `AIProvider` (Protocol): un único método `complete(*, system_prompt, user_prompt) -> str`.
- `LangChainOpenAIProvider`: implementación con cadena LCEL simple
  (`ChatPromptTemplate | ChatOpenAI | StrOutputParser`). `langchain-core` y
  `langchain-openai` son dependencias **base** (versión congelada en
  `pyproject.toml`) y se importan a nivel de módulo; los tests no dependen de
  esos paquetes porque sustituyen el proveedor por un `FakeAIProvider`.
- `get_ai_provider()`: factory/dependency de FastAPI. En tests se sustituye con un
  `FakeAIProvider` vía `app.dependency_overrides[get_ai_provider]`.

Cambiar de proveedor (otro LLM, un stub) es cambiar la factory, sin tocar el
dominio.

---

## Archivos

| Archivo | Rol |
|---|---|
| `provider.py` | Interfaz `AIProvider`, `LangChainOpenAIProvider`, `AIProviderError`, `get_ai_provider` |
| `prompts.py` | Arma el contexto oculto (esquema/columnas + reglas de salida) y el prompt final |
| `schemas.py` | `QueryGenerate{Request,Response}`, `ChartGenerate{Request,Response}` |
| `service.py` | Orquesta contexto → proveedor → revalidación; punto único de traducción a 503 |
| `router.py` | 2 endpoints protegidos con `tablerillos.ai.use` |

---

## API

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/admin/ai/query/generate` | `tablerillos.ai.use` | Body `{connection_id, prompt, current_sql?}` → `{sql, explanation?}`. El SQL pasa `sql_guard.validate_sql` antes de responder. |
| POST | `/api/admin/ai/charts/generate` | `tablerillos.ai.use` | Body `{dataset_id, prompt, current_spec?, chart_type?}` → `{chart_spec, explanation?}`. La spec pasa `parse_spec` + `validate_spec_against_dataset`. |

---

## Contexto oculto (el usuario nunca lo ve ni lo escribe)

`prompt final = [contexto oculto] + [prompt del usuario]`

- **`/query/generate`**: el contexto es el esquema de la conexión, reusando el
  explorador de conexiones (`connections/service.py` → `get_schema` / `get_columns`),
  excluyendo esquemas de sistema. La introspección está **acotada** a
  `_MAX_SCHEMA_OBJECTS` (40) objetos para no leer la BD externa sin límite.
- **`/charts/generate`**: el contexto es `columns_schema` / `parameters_schema` ya
  guardados en el `Dataset` — **no** se reconsulta la BD externa — más las reglas
  de ChartSpec 1.0 por tipo de gráfica.

La IA responde SIEMPRE un objeto JSON (`{"sql"|"chart_spec", "explanation"}`), para
parsearlo de forma determinista y luego revalidarlo. Nunca se le pide código.

---

## Reglas de negocio

- **SQL**: un único `SELECT` / `WITH … SELECT` compatible con `sql_guard`. Nunca
  DML/DDL ni múltiples statements. Si la IA lo viola → 422.
- **ChartSpec**: siempre una spec JSON válida para el tipo y el dataset. El backend
  **fija** `data.dataset_id` (la IA no decide sobre qué dataset opera). Si la spec
  no parsea o no valida contra el dataset → 422.
- **Límite de prompt**: `AI_MAX_PROMPT_CHARS` (422 si se excede).
- **Timeout**: `AI_REQUEST_TIMEOUT_SECONDS` como límite duro en la llamada al LLM.

---

## Resiliencia

Un punto único (`service._complete`) llama al `AIProvider` y traduce cualquier
fallo (timeout, falta de API key, error de OpenAI, dependencias no instaladas) a
un **503** con mensaje genérico — nunca un 500 genérico y nunca filtrando el
detalle interno (que podría revelar configuración/credenciales). Es el mismo
patrón que `datasets/service.py::_connect`. La lectura del esquema externo para el
contexto también traduce `psycopg.OperationalError` a 503.

---

## Seguridad

- La `OPENAI_API_KEY` vive **solo** en `Settings`/entorno. Nunca se envía al
  frontend, nunca se registra en logs, nunca aparece en mensajes de error.
- Todo endpoint exige `tablerillos.ai.use` vía `require_permission` (declarado en
  `manifest.minerva.yml`, otorgado a los mismos roles que `datasets.create` /
  `charts.create`: Superadmin, Administrador BI y Editor).
- La salida del LLM se revalida con las defensas existentes; la IA no es una vía
  para saltarse `sql_guard` ni la validación de ChartSpec.

---

## Variables de entorno relevantes

| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | `None` | API key de OpenAI. Vacía → 503. Solo en entorno/secret manager. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo de chat. |
| `AI_REQUEST_TIMEOUT_SECONDS` | `30` | Timeout duro de la llamada al LLM. |
| `AI_MAX_PROMPT_CHARS` | `4000` | Tope de caracteres del prompt del usuario. |

---

## Dependencias

`langchain-core` y `langchain-openai` (no el meta-paquete `langchain` ni
`deepagents`), como dependencias base con versión congelada. Solo se importan en
`provider.py`; los tests mockean el proveedor y **ninguno** llama a OpenAI de verdad.

---

## Migración

Ninguna. El módulo no persiste nada (sin tabla `ai_generations`, fuera de alcance).
