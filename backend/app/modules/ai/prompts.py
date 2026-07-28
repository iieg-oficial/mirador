import json
from typing import NamedTuple

from app.modules.charts.spec import (
    OVERRIDABLE_SECTIONS,
    TYPE_FIELDS,
    ChartType,
)
from app.modules.datasets.models import Dataset


class SchemaObject(NamedTuple):
    """Un objeto (tabla/vista) del esquema externo para el contexto del prompt."""

    schema: str
    name: str
    columns: list[str]


_QUERY_SYSTEM = """\
You are an expert PostgreSQL SQL assistant for a BI platform.
You generate READ-ONLY queries over the schema described to you.

Output rules (mandatory):
- Return EXCLUSIVELY a valid JSON object, with no extra text or markdown.
- Format: {{"sql": "<query>", "explanation": "<short explanation, in Spanish>"}}.
- The `explanation` value MUST be written in Spanish.
- The query must be a SINGLE SELECT statement (or WITH ... SELECT). Never
  INSERT/UPDATE/DELETE/DDL, never multiple statements, never multiple ';'.
- Use only tables and columns present in the schema. Do not invent names.
- For dynamic values use named parameters of the form :name.

Available schema:
{schema}
"""

_CHART_SYSTEM = """\
You are an assistant that generates chart specifications in ChartSpec 1.0 format
for a BI platform. You NEVER generate code: only a ChartSpec JSON.

Output rules (mandatory):
- Return EXCLUSIVELY a valid JSON object, with no extra text or markdown.
- Format: {{"chart_spec": <ChartSpec 1.0>, "explanation": "<short explanation, in Spanish>"}}.
- The `explanation` value MUST be written in Spanish.
- Use only columns present in the described dataset. Do not invent names.
- Do not include "code": the chart is described with encodings, not code.

ChartSpec 1.0 structure:
- "version": "1.0"
- "data": {{"dataset_id": <set by the backend>, "filters": [], "sort": [], "limit": <=50000}}
- "visual": {{"chart_type": <type>, "title": <str>}}
- "encodings": each encoding is an object {{"field": <column>, "aggregation": <optional>}}.
  - "x", "y", "tooltip": ARRAYS of encodings (use [] if none).
  - "color", "size": a SINGLE encoding object, or omit them entirely. NEVER a string
    or an array (e.g. use "color": {{"field": "sexo"}}, never "color": "sexo").
  - "fields": object mapping named roles to encodings (for candlestick/boxplot).

Per-chart-type rules:
{type_rules}

Allowed visual overrides (optional): {overridable}.

Available dataset:
{dataset}
"""

_TYPE_RULES = """\
- line/bar/scatter: require at least one field in x and one metric in y.
- pie/treemap: exactly one dimension (x) and one metric (y).
- kpi: exactly one metric in y, with aggregation.
- table: at least one column in the encodings.
- candlestick: encodings.fields with open, close, lowest, highest + one field in x.
- boxplot: encodings.fields with min, q1, median, q3, max + one field in x."""

_ECHARTS_SYSTEM = """\
You generate JavaScript code that builds an Apache ECharts chart for a BI platform.

The code runs in a sandbox as the body of a function with three arguments
already in scope:
- `rows`: an array of row objects (each key is a dataset column name).
- `echarts`: the ECharts module (use e.g. `echarts.graphic.LinearGradient`).
- `params`: an object with the current value of each interactive parameter
  declared on the chart (may be empty — do not assume any key exists).
The code MUST `return` a valid ECharts `option` object (you MAY instead return
`{{ option, events }}` if the user asks for click/legend/etc. interactions, where
`events` maps an ECharts event name to `(params, api) => {{...}}` and `api` exposes
`highlight`/`downplay`/`select`/`unselect`/`dispatchAction`; default to returning
just `option` when not asked for interactions). Do NOT call `echarts.init`, do not
touch the DOM, do not import anything.

Output rules (mandatory):
- Return EXCLUSIVELY a valid JSON object, with no extra text or markdown.
- Format: {{"code": "<javascript>", "explanation": "<short explanation, in Spanish>"}}.
- The `explanation` value MUST be written in Spanish.
- `code` is a single JavaScript snippet (the function body ending in `return`).
- Access columns via the row keys (e.g. `rows.map((r) => r.<column>)`).
- Use ONLY columns present in the dataset below. Do not invent names.

Available dataset:
{dataset}
"""

_PLOTLY_SYSTEM = """\
You generate Python code that builds a Plotly figure for a BI platform.

The code runs in a Pyodide sandbox with these already available:
- `rows`: a list of dicts (each key is a dataset column name).
- `params`: a dict with the current value of each interactive parameter
  declared on the chart (may be empty — do not assume any key exists).
- `pandas` and `plotly` are installed (import them as needed).
The code MUST leave the finished figure in a variable named `fig`. Do NOT call
`fig.show()`, do not read files, do not access the network.

Output rules (mandatory):
- Return EXCLUSIVELY a valid JSON object, with no extra text or markdown.
- Format: {{"code": "<python>", "explanation": "<short explanation, in Spanish>"}}.
- The `explanation` value MUST be written in Spanish.
- `code` is a single Python snippet that ends with `fig` assigned.
- Build a DataFrame from `rows` (e.g. `pd.DataFrame(rows)`) and use its columns.
- Use ONLY columns present in the dataset below. Do not invent names.

Available dataset:
{dataset}
"""


def render_connection_schema(objects: list[SchemaObject]) -> str:
    """Formatea (esquema, objeto, columnas) como líneas legibles para el modelo."""
    if not objects:
        return "(no objects available)"
    return "\n".join(f"- {obj.schema}.{obj.name}({', '.join(obj.columns)})" for obj in objects)


def build_query_system_prompt(schema_context: str) -> str:
    return _QUERY_SYSTEM.format(schema=schema_context)


def build_query_user_prompt(prompt: str, current_sql: str | None) -> str:
    if current_sql:
        return f"Current query to adjust:\n{current_sql}\n\nUser request:\n{prompt}"
    return f"User request:\n{prompt}"


def render_dataset_context(dataset: Dataset) -> str:
    """Contexto del dataset a partir de la metadata YA guardada (columns_schema /
    parameters_schema). NO reconsulta la BD externa."""
    columns = (dataset.columns_schema or {}).get("columns", [])
    if columns:
        col_lines = "\n".join(
            f"  - {c['name']} ({c.get('data_type', '?')}"
            + (f", {c['semantic_type']}" if c.get("semantic_type") else "")
            + ")"
            for c in columns
        )
    else:
        col_lines = "  (no inferred columns)"
    params = [p["name"] for p in (dataset.parameters_schema or {}).get("params", [])]
    params_line = f"\nParameters: {', '.join(params)}" if params else ""
    return f"Dataset '{dataset.name}'.\nColumns:\n{col_lines}{params_line}"


def build_chart_system_prompt(dataset_context: str, chart_type: ChartType | None) -> str:
    base = _CHART_SYSTEM.format(
        type_rules=_TYPE_RULES,
        overridable=", ".join(OVERRIDABLE_SECTIONS),
        dataset=dataset_context,
    )
    if chart_type:
        named = TYPE_FIELDS.get(chart_type)
        extra = f" (requires encodings.fields with: {', '.join(named)})" if named else ""
        base += f"\nThe user requires chart_type = '{chart_type}'{extra}. Respect it."
    return base


def build_chart_user_prompt(
    prompt: str, current_spec: dict | None, chart_type: ChartType | None
) -> str:
    parts: list[str] = []
    if current_spec:
        parts.append(
            "Current ChartSpec to adjust:\n" + json.dumps(current_spec, ensure_ascii=False)
        )
    if chart_type:
        parts.append(f"Required chart type: {chart_type}")
    parts.append(f"User request:\n{prompt}")
    return "\n\n".join(parts)


def build_echarts_system_prompt(dataset_context: str) -> str:
    return _ECHARTS_SYSTEM.format(dataset=dataset_context)


def build_plotly_system_prompt(dataset_context: str) -> str:
    return _PLOTLY_SYSTEM.format(dataset=dataset_context)


def build_chart_code_user_prompt(prompt: str, chart_type: ChartType | None) -> str:
    parts: list[str] = []
    if chart_type:
        parts.append(f"Desired chart type: {chart_type}")
    parts.append(f"User request:\n{prompt}")
    return "\n\n".join(parts)
