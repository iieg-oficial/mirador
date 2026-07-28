"""ChartSpec 1.0: especificación declarativa y versionada de una gráfica.

Formato canónico del laboratorio de datos: describe QUÉ datos usa la gráfica
(dataset, filtros, orden, límite) y CÓMO se visualizan (tipo, encodings,
interacciones, estilo), independiente del motor de render (RNF-03). El
frontend la convierte en EChartsOption; el backend genera desde ella la
consulta segura (query_builder) — nunca se acepta SQL libre desde la gráfica.
"""

import json
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from app.modules.datasets.models import Dataset
from app.modules.datasets.schemas import Aggregation

SPEC_VERSION: Literal["1.0"] = "1.0"

ChartType = Literal[
    "line",
    "bar",
    "pie",
    "scatter",
    "candlestick",
    "boxplot",
    "treemap",
    "table",
    "kpi",
]

FilterOperator = Literal[
    "=", "!=", ">", ">=", "<", "<=",
    "in", "not_in", "contains", "between", "is_null", "is_not_null",
]

# Tipos con columnas nombradas (encodings.fields) en vez de x/y.
TYPE_FIELDS: dict[str, tuple[str, ...]] = {
    "candlestick": ("open", "close", "lowest", "highest"),
    "boxplot": ("min", "q1", "median", "q3", "max"),
}


class FilterSpec(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    operator: FilterOperator
    value: Any = None

    @model_validator(mode="after")
    def _value_matches_operator(self) -> "FilterSpec":
        if self.operator in ("is_null", "is_not_null"):
            if self.value is not None:
                raise ValueError(f"El operador '{self.operator}' no lleva valor.")
        elif self.operator in ("in", "not_in"):
            if not isinstance(self.value, list) or not self.value:
                raise ValueError(f"El operador '{self.operator}' requiere una lista no vacía.")
        elif self.operator == "between":
            if not isinstance(self.value, list) or len(self.value) != 2:
                raise ValueError("El operador 'between' requiere una lista de dos valores.")
        elif self.value is None or isinstance(self.value, (list, dict)):
            raise ValueError(f"El operador '{self.operator}' requiere un valor escalar.")
        return self


class SortSpec(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    direction: Literal["asc", "desc"] = "asc"


class DataSpec(BaseModel):
    dataset_id: uuid.UUID
    filters: list[FilterSpec] = Field(default_factory=list)
    sort: list[SortSpec] = Field(default_factory=list)
    limit: int = Field(default=1000, ge=1, le=50000)


class VisualSpec(BaseModel):
    chart_type: ChartType
    title: str | None = Field(default=None, max_length=200)
    subtitle: str | None = Field(default=None, max_length=200)


class Encoding(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    aggregation: Aggregation | None = None
    label: str | None = Field(default=None, max_length=120)


class EncodingsSpec(BaseModel):
    x: list[Encoding] = Field(default_factory=list)
    y: list[Encoding] = Field(default_factory=list)
    color: Encoding | None = None
    size: Encoding | None = None
    tooltip: list[Encoding] = Field(default_factory=list)
    # Columnas nombradas para candlestick/boxplot (open/close/... , min/q1/...).
    fields: dict[str, str] = Field(default_factory=dict)


class InteractionsSpec(BaseModel):
    tooltip: bool = True
    legend: bool = True
    zoom: bool = False
    download: bool = False


class StyleSpec(BaseModel):
    # Temas registrados en el frontend (RNF-07); "default" usa el de ECharts.
    theme: Literal["institutional", "default"] = "institutional"
    show_labels: bool = False
    orientation: Literal["vertical", "horizontal"] = "vertical"
    legend_position: str = Field(default="top", max_length=20)


ParamControl = Literal[
    "select", "multiselect", "radio", "checkbox", "slider", "date", "number", "text",
]

_MAX_PARAMS = 10
_PARAM_ID_RE = r"^[a-zA-Z_][a-zA-Z0-9_]*$"


class ParamOption(BaseModel):
    value: Any
    label: str = Field(min_length=1, max_length=200)


class ParamSpec(BaseModel):
    """Parámetro interactivo del modo avanzado: llega al sandbox como `params.<id>`.

    Puramente client-side (el backend no lo usa para generar SQL): sirve para
    que el código del usuario reaccione a un control sin volver a consultar al
    servidor, p.ej. filtrar `rows` por el municipio elegido.
    """

    id: str = Field(min_length=1, max_length=50, pattern=_PARAM_ID_RE)
    label: str = Field(min_length=1, max_length=100)
    control: ParamControl
    options: list[ParamOption] = Field(default_factory=list)
    # Alternativa a `options`: deriva las opciones de una columna del dataset,
    # client-side, en tiempo de render (ver frontend/src/features/charts/params.ts).
    options_from_column: str | None = Field(default=None, max_length=120)
    min: float | None = None
    max: float | None = None
    step: float | None = None
    default: Any = None


# Secciones del EChartsOption que aceptan overrides (Fase 5). Todo lo demás
# (series, dataset, toolbox, ...) lo genera únicamente el adaptador del frontend.
OVERRIDABLE_SECTIONS = ("legend", "tooltip", "grid")

# Claves que permitirían prototype pollution al hacer deep-merge en el navegador.
_DANGEROUS_KEYS = {"__proto__", "constructor", "prototype"}

_MAX_OVERRIDES_BYTES = 8_192


def _assert_safe_keys(value: Any, path: str) -> None:
    if isinstance(value, dict):
        for key, sub in value.items():
            if key in _DANGEROUS_KEYS:
                raise ValueError(f"Clave no permitida en overrides: '{path}.{key}'.")
            _assert_safe_keys(sub, f"{path}.{key}")
    elif isinstance(value, list):
        for i, item in enumerate(value):
            _assert_safe_keys(item, f"{path}[{i}]")


class ChartSpec(BaseModel):
    version: Literal["1.0"] = SPEC_VERSION
    data: DataSpec
    visual: VisualSpec
    encodings: EncodingsSpec = Field(default_factory=EncodingsSpec)
    interactions: InteractionsSpec = Field(default_factory=InteractionsSpec)
    style: StyleSpec = Field(default_factory=StyleSpec)
    # Overrides controlados sobre el EChartsOption generado (Fase 5): JSON puro
    # (sin funciones), solo secciones visuales de la whitelist.
    overrides: dict[str, Any] | None = None
    # Gráfica "de código": JS que el frontend ejecuta para armar el EChartsOption
    # a partir de las filas del dataset (herramienta interna, ver SandboxEditor).
    # Cuando está presente, los encodings no aplican y el backend solo entrega
    # las filas crudas del dataset (query_builder).
    code: str | None = Field(default=None, max_length=20_000)
    # Motor de la gráfica de código: 'echarts' ejecuta JS en el navegador;
    # 'plotly' ejecuta Python (Pyodide) y renderiza la figura con plotly.js.
    code_engine: Literal["echarts", "plotly"] = "echarts"
    # Parámetros interactivos del modo avanzado (controles → `params.<id>` en el
    # sandbox). Solo tienen efecto cuando `code` está presente.
    params: list[ParamSpec] = Field(default_factory=list)

    @field_validator("params")
    @classmethod
    def _check_params(cls, v: list[ParamSpec]) -> list[ParamSpec]:
        if len(v) > _MAX_PARAMS:
            raise ValueError(f"No se permiten más de {_MAX_PARAMS} parámetros.")
        ids = [p.id for p in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Los ids de params deben ser únicos.")
        return v

    @field_validator("overrides")
    @classmethod
    def _check_overrides(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return v
        for section, content in v.items():
            if section not in OVERRIDABLE_SECTIONS:
                raise ValueError(
                    f"Sección de overrides no permitida: '{section}' "
                    f"(permitidas: {', '.join(OVERRIDABLE_SECTIONS)})."
                )
            if not isinstance(content, dict):
                raise ValueError(f"overrides.{section} debe ser un objeto.")
            _assert_safe_keys(content, section)
        if len(json.dumps(v)) > _MAX_OVERRIDES_BYTES:
            raise ValueError(f"overrides excede el tamaño máximo ({_MAX_OVERRIDES_BYTES} bytes).")
        return v


class ChartSpecValidation(BaseModel):
    """Respuesta de POST /charts/validate (RF-06)."""

    valid: bool
    errors: list[str]
    warnings: list[str]


# ── Validación contra el dataset ──────────────────────────────────────────────


def referenced_fields(spec: ChartSpec) -> set[str]:
    """Todas las columnas del dataset que la spec referencia."""
    enc = spec.encodings
    fields: set[str] = set()
    for e in [*enc.x, *enc.y, *enc.tooltip, enc.color, enc.size]:
        if e is not None:
            fields.add(e.field)
    fields.update(v for v in enc.fields.values() if v)
    fields.update(f.field for f in spec.data.filters)
    fields.update(s.field for s in spec.data.sort)
    return fields


def _check_type_rules(spec: ChartSpec, errors: list[str], warnings: list[str]) -> None:
    """Reglas por tipo de gráfica (§16 del requerimiento, sin mapas)."""
    ct = spec.visual.chart_type
    enc = spec.encodings

    required_named = TYPE_FIELDS.get(ct)
    if required_named:
        missing = [k for k in required_named if not enc.fields.get(k)]
        if missing:
            errors.append(
                f"'{ct}' requiere encodings.fields con: {', '.join(missing)}."
            )
        if not enc.x:
            errors.append(f"'{ct}' requiere un encoding en x (categoría/fecha).")
        return

    if ct == "kpi":
        if len(enc.y) != 1:
            errors.append("'kpi' requiere exactamente una métrica en y.")
        elif enc.y[0].aggregation is None:
            errors.append("'kpi' requiere una agregación en la métrica.")
        return

    if ct == "table":
        if not referenced_fields(spec) - {f.field for f in spec.data.filters}:
            errors.append("'table' requiere al menos una columna en los encodings.")
        return

    # line / bar / pie / scatter / treemap: requieren x e y.
    if not enc.x:
        errors.append(f"'{ct}' requiere al menos un campo en x.")
    if not enc.y:
        errors.append(f"'{ct}' requiere al menos una métrica en y.")

    if ct in ("pie", "treemap"):
        if len(enc.x) > 1 or len(enc.y) > 1:
            errors.append(f"'{ct}' admite solo una dimensión y una métrica.")
        if ct == "pie" and spec.data.limit > 30:
            warnings.append(
                "'pie' con más de 30 categorías es ilegible; considera reducir el límite."
            )


def validate_spec_against_dataset(
    spec: ChartSpec, dataset: Dataset
) -> tuple[list[str], list[str]]:
    """Valida la spec contra las columnas reales del dataset (RF-06).

    Devuelve (errors, warnings). Con errors vacío la spec es ejecutable.
    """
    errors: list[str] = []
    warnings: list[str] = []

    columns = {c["name"]: c for c in (dataset.columns_schema or {}).get("columns", [])}

    # Gráfica de código: el JS del frontend controla el render; no hay encodings
    # que validar. Solo se comprueba que filtros/orden (p.ej. filtros globales de
    # un tablero) referencien columnas reales del dataset.
    if spec.code and spec.code.strip():
        if columns:
            refs = {f.field for f in spec.data.filters} | {s.field for s in spec.data.sort}
            unknown = sorted(refs - set(columns))
            if unknown:
                errors.append(
                    f"Filtros/orden referencian columnas inexistentes: {', '.join(unknown)}."
                )
            param_cols = {p.options_from_column for p in spec.params if p.options_from_column}
            unknown_params = sorted(param_cols - set(columns))
            if unknown_params:
                errors.append(
                    f"params.options_from_column referencia columnas inexistentes: "
                    f"{', '.join(unknown_params)}."
                )
        return errors, warnings

    # Solo se validan campos si el dataset ya tiene columnas inferidas.
    if columns:
        unknown = sorted(referenced_fields(spec) - set(columns))
        if unknown:
            errors.append(
                f"La spec referencia columnas inexistentes en el dataset: {', '.join(unknown)}."
            )

        # Agregaciones permitidas por columna (metadata semántica del dataset).
        enc = spec.encodings
        for e in [*enc.x, *enc.y, *enc.tooltip, enc.color, enc.size]:
            if e is None or e.aggregation is None:
                continue
            col = columns.get(e.field)
            allowed = (col or {}).get("aggregations")
            if col is not None and allowed is not None and e.aggregation not in allowed:
                errors.append(
                    f"La columna '{e.field}' no permite la agregación '{e.aggregation}' "
                    f"(permitidas: {', '.join(allowed) or 'ninguna'})."
                )

        # Advertencia si una métrica de y no está marcada como métrica.
        for e in spec.encodings.y:
            col = columns.get(e.field)
            if col is not None and col.get("is_metric") is False and e.aggregation not in (
                "count",
                "count_distinct",
            ):
                warnings.append(
                    f"La columna '{e.field}' no está marcada como métrica en el dataset."
                )

    _check_type_rules(spec, errors, warnings)
    return errors, warnings


def parse_spec(raw: dict[str, Any]) -> tuple[ChartSpec | None, list[str]]:
    """Parsea un dict a ChartSpec, devolviendo errores legibles si no cumple el esquema."""
    try:
        return ChartSpec.model_validate(raw), []
    except ValidationError as exc:
        errors = [
            f"{'.'.join(str(part) for part in err['loc']) or 'spec'}: {err['msg']}"
            for err in exc.errors()
        ]
        return None, errors
