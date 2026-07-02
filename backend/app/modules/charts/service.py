"""Lógica de negocio del módulo charts: CRUD, validación de spec y preview."""

import hashlib
import uuid

from sqlmodel import Session, select

from app.modules.auth.models import CurrentUser
from app.modules.charts.models import Chart
from app.modules.charts.query_builder import build_query
from app.modules.charts.schemas import ChartCreate, ChartPreviewResult, ChartUpdate
from app.modules.connections.models import Connection
from app.modules.datasets.models import Dataset, DatasetStatus
from app.modules.datasets.schemas import PreviewResult
from app.modules.datasets import service as dataset_service
from app.modules.charts.spec import (
    TYPE_FIELDS,
    ChartSpec,
    ChartSpecValidation,
    parse_spec,
    validate_spec_against_dataset,
)

# Tipos de gráfica soportados (los 9 del laboratorio de datos; el frontend
# renderiza table/kpi como componentes React y el resto con ECharts).
_CHART_TYPES = {
    "line", "bar", "pie", "scatter", "candlestick", "boxplot", "treemap", "table", "kpi",
}

# Tipos con columnas nombradas (viven en field_mapping["fields"]) en vez de x/y.
_TYPE_FIELDS = TYPE_FIELDS


def _dataset_column_names(dataset: Dataset) -> set[str]:
    schema = dataset.columns_schema or {}
    return {c["name"] for c in schema.get("columns", []) if "name" in c}


def _referenced_columns(field_mapping: dict) -> set[str]:
    """Columnas referenciadas en el mapeo (valores str, listas de str o dict de str)."""
    cols: set[str] = set()
    for value in field_mapping.values():
        if isinstance(value, str):
            cols.add(value)
        elif isinstance(value, list):
            cols.update(v for v in value if isinstance(v, str))
        elif isinstance(value, dict):  # p. ej. `fields` de candlestick/boxplot
            cols.update(v for v in value.values() if isinstance(v, str))
    return cols


def _validate_spec(chart_type: str, field_mapping: dict, dataset: Dataset) -> None:
    """Valida tipo y mapeo de campos contra las columnas reales del dataset."""
    if chart_type not in _CHART_TYPES:
        raise ValueError(
            f"Tipo de gráfica no soportado: '{chart_type}'. "
            f"Permitidos: {', '.join(sorted(_CHART_TYPES))}."
        )
    if not field_mapping:
        raise ValueError("field_mapping no puede estar vacío.")

    required = _TYPE_FIELDS.get(chart_type)
    if required:
        fields = field_mapping.get("fields")
        missing = (
            list(required)
            if not isinstance(fields, dict)
            else [k for k in required if not fields.get(k)]
        )
        if missing:
            raise ValueError(
                f"'{chart_type}' requiere field_mapping.fields con: {', '.join(missing)}."
            )
    elif not field_mapping.get("x") or not field_mapping.get("y"):
        raise ValueError("field_mapping requiere las columnas 'x' e 'y'.")

    known = _dataset_column_names(dataset)
    # Solo se valida el mapeo si el dataset ya tiene columnas inferidas.
    if known:
        unknown = _referenced_columns(field_mapping) - known
        if unknown:
            raise ValueError(
                "field_mapping referencia columnas inexistentes en el dataset: "
                f"{', '.join(sorted(unknown))}."
            )


def list_charts(session: Session) -> list[Chart]:
    return list(
        session.exec(select(Chart).where(Chart.status != "archived")).all()
    )


def get_chart(session: Session, chart_id: uuid.UUID) -> Chart | None:
    return session.get(Chart, chart_id)


def create_chart(
    session: Session, data: ChartCreate, user: CurrentUser, dataset: Dataset
) -> Chart:
    if dataset.status not in (DatasetStatus.validated, DatasetStatus.published):
        raise ValueError("El dataset debe estar validado antes de crear una gráfica sobre él.")
    _validate_spec(data.chart_type, data.field_mapping, dataset)
    obj = Chart(
        **data.model_dump(),
        renderer="echarts",
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def update_chart(session: Session, obj: Chart, data: ChartUpdate, dataset: Dataset) -> Chart:
    fields = data.model_dump(exclude_unset=True)
    if "chart_type" in fields or "field_mapping" in fields:
        _validate_spec(
            fields.get("chart_type", obj.chart_type),
            fields.get("field_mapping", obj.field_mapping),
            dataset,
        )
    for key, value in fields.items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def delete_chart(session: Session, obj: Chart) -> None:
    obj.status = "archived"
    session.add(obj)
    session.commit()


def validate_chart_spec(session: Session, raw_spec: dict) -> ChartSpecValidation:
    """Valida una ChartSpec completa: esquema JSON, dataset y compatibilidad (RF-06)."""
    spec, schema_errors = parse_spec(raw_spec)
    if spec is None:
        return ChartSpecValidation(valid=False, errors=schema_errors, warnings=[])

    dataset = dataset_service.get_dataset(session, spec.data.dataset_id)
    if dataset is None or dataset.status == DatasetStatus.archived:
        return ChartSpecValidation(
            valid=False, errors=["El dataset referenciado no existe."], warnings=[]
        )
    if dataset.status not in (DatasetStatus.validated, DatasetStatus.published):
        return ChartSpecValidation(
            valid=False,
            errors=["El dataset debe estar validado antes de graficar sobre él."],
            warnings=[],
        )

    errors, warnings = validate_spec_against_dataset(spec, dataset)
    return ChartSpecValidation(valid=not errors, errors=errors, warnings=warnings)


def resolve_spec(session: Session, raw_spec: dict) -> tuple[ChartSpec, Dataset, list[str]]:
    """Parsea la spec, resuelve su dataset y la valida. Lanza ValueError si no
    es ejecutable; devuelve (spec, dataset, warnings) si lo es."""
    spec, schema_errors = parse_spec(raw_spec)
    if spec is None:
        raise ValueError(" | ".join(schema_errors))

    dataset = dataset_service.get_dataset(session, spec.data.dataset_id)
    if dataset is None or dataset.status == DatasetStatus.archived:
        raise ValueError("El dataset referenciado no existe.")
    if dataset.status not in (DatasetStatus.validated, DatasetStatus.published):
        raise ValueError("El dataset debe estar validado antes de graficar sobre él.")

    errors, warnings = validate_spec_against_dataset(spec, dataset)
    if errors:
        raise ValueError(" | ".join(errors))
    return spec, dataset, warnings


def preview_spec(
    connection: Connection,
    dataset: Dataset,
    spec: ChartSpec,
    dataset_params: dict,
    warnings: list[str],
) -> ChartPreviewResult:
    """Genera la consulta desde la spec y la ejecuta (agregación server-side).

    Cachea bajo `{dataset_id}:chart:{hash_del_sql}` — clave distinta a la del
    dataset crudo pero con su mismo prefijo, así la invalidación por dataset
    (SCAN ds:{id}:*) también limpia los previews de gráficas.
    """
    sql, params, limit = build_query(spec, dataset)
    cache_id = f"{dataset.id}:chart:{hashlib.sha1(sql.encode()).hexdigest()[:12]}"
    result = dataset_service.run_query(
        connection,
        sql,
        {**dataset_params, **params},
        limit,
        dataset_id=cache_id,
        cache_ttl_seconds=dataset.cache_ttl_seconds,
    )
    return ChartPreviewResult(
        **result.model_dump(),
        generated_sql=sql,
        warnings=warnings,
    )


def preview_chart(
    connection: Connection,
    dataset: Dataset,
) -> PreviewResult:
    """Ejecuta el dataset asociado y devuelve filas para renderizar la gráfica.

    Usa el cache de Redis del dataset para no re-ejecutar la query en cada
    carga de la gráfica.
    """
    return dataset_service.run_query(
        connection,
        dataset.sql_query,
        {},
        dataset.max_rows,
        dataset_id=str(dataset.id),
        cache_ttl_seconds=dataset.cache_ttl_seconds,
    )
