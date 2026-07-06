"""Lógica de negocio del módulo charts: CRUD, validación de spec y preview.

El formato canónico de una gráfica es la ChartSpec 1.0 (charts/spec.py);
`dataset_id` y `chart_type` del modelo son denormalizados desde la spec y se
sincronizan aquí en cada create/update.
"""

import hashlib
import uuid

from sqlmodel import Session, col, or_, select

from app.modules.auth.models import CurrentUser
from app.modules.charts.models import Chart, ChartStatus, ChartVersion
from app.modules.charts.query_builder import build_query
from app.modules.charts.schemas import ChartCreate, ChartPreviewResult, ChartUpdate
from app.modules.connections.models import Connection
from app.modules.datasets.models import Dataset, DatasetStatus
from app.modules.datasets import service as dataset_service
from app.modules.charts.spec import (
    ChartSpec,
    ChartSpecValidation,
    parse_spec,
    validate_spec_against_dataset,
)
from app.modules.tags import service as tags_service
from app.modules.tags.models import ChartTag


def _assert_spec_ok(spec: ChartSpec, dataset: Dataset) -> None:
    """Valida la spec contra el dataset; lanza ValueError con los errores."""
    if dataset.status not in (DatasetStatus.validated, DatasetStatus.published):
        raise ValueError("El dataset debe estar validado antes de graficar sobre él.")
    errors, _ = validate_spec_against_dataset(spec, dataset)
    if errors:
        raise ValueError(" | ".join(errors))


def list_charts(
    session: Session,
    status: ChartStatus | None = None,
    q: str | None = None,
    tag_ids: list[uuid.UUID] | None = None,
) -> list[Chart]:
    """Lista gráficas; sin filtro excluye archivadas, con filtro devuelve solo ese estado."""
    query = select(Chart)
    if status is not None:
        query = query.where(Chart.status == status.value)
    else:
        query = query.where(Chart.status != ChartStatus.archived.value)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(col(Chart.name).ilike(pattern), col(Chart.description).ilike(pattern))
        )
    for tag_id in tag_ids or []:
        query = query.where(
            col(Chart.id).in_(select(ChartTag.chart_id).where(ChartTag.tag_id == tag_id))
        )
    return list(session.exec(query).all())


def get_chart(session: Session, chart_id: uuid.UUID) -> Chart | None:
    return session.get(Chart, chart_id)


def _renderer_for(spec: ChartSpec) -> str:
    """Las gráficas de código Python se materializan con Plotly; el resto con ECharts."""
    return "plotly" if spec.code and spec.code_engine == "plotly" else "echarts"


def create_chart(session: Session, data: ChartCreate, user: CurrentUser, dataset: Dataset) -> Chart:
    _assert_spec_ok(data.chart_spec, dataset)
    obj = Chart(
        dataset_id=data.chart_spec.data.dataset_id,
        name=data.name,
        description=data.description,
        renderer=_renderer_for(data.chart_spec),
        chart_type=data.chart_spec.visual.chart_type,
        chart_spec=data.chart_spec.model_dump(mode="json"),
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(obj)
    session.commit()
    session.refresh(obj)
    tags_service.set_entity_tags(session, ChartTag, "chart_id", obj.id, data.tag_ids)
    session.refresh(obj)
    return obj


def _snapshot_version(
    session: Session, chart: Chart, user: CurrentUser, comment: str | None
) -> None:
    """Guarda el spec vigente de la gráfica como nueva versión del historial."""
    last = session.exec(
        select(ChartVersion.version_number)
        .where(ChartVersion.chart_id == chart.id)
        .order_by(col(ChartVersion.version_number).desc())
        .limit(1)
    ).first()
    session.add(
        ChartVersion(
            chart_id=chart.id,
            version_number=(last or 0) + 1,
            chart_spec=chart.chart_spec,
            change_comment=comment,
            created_by=user.sub,
            created_by_email=user.email,
        )
    )


def update_chart(
    session: Session, obj: Chart, data: ChartUpdate, dataset: Dataset, user: CurrentUser
) -> Chart:
    """Actualiza la gráfica; `dataset` es el que referencia la spec nueva (o la vigente).

    Si el spec cambia, el spec ANTERIOR se preserva como versión (RF-12)
    junto con el autor del cambio y su comentario opcional.
    """
    if data.chart_spec is not None:
        _assert_spec_ok(data.chart_spec, dataset)
        new_spec = data.chart_spec.model_dump(mode="json")
        if new_spec != obj.chart_spec:
            _snapshot_version(session, obj, user, data.change_comment)
        obj.chart_spec = new_spec
        obj.dataset_id = data.chart_spec.data.dataset_id
        obj.chart_type = data.chart_spec.visual.chart_type
        obj.renderer = _renderer_for(data.chart_spec)
    fields = data.model_dump(exclude_unset=True, exclude={"chart_spec", "change_comment"})
    tag_ids = fields.pop("tag_ids", None)
    if isinstance(fields.get("status"), ChartStatus):
        fields["status"] = fields["status"].value
    for key, value in fields.items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    if tag_ids is not None:
        tags_service.set_entity_tags(session, ChartTag, "chart_id", obj.id, tag_ids)
    session.refresh(obj)
    return obj


def list_versions(session: Session, chart_id: uuid.UUID) -> list[ChartVersion]:
    return list(
        session.exec(
            select(ChartVersion)
            .where(ChartVersion.chart_id == chart_id)
            .order_by(col(ChartVersion.version_number).desc())
        ).all()
    )


def restore_version(
    session: Session, obj: Chart, version: ChartVersion, user: CurrentUser
) -> Chart:
    """Restaura el spec de una versión anterior (RF-12).

    El spec vigente se snapshotea antes, así la restauración también queda en
    el historial y es reversible. Se valida contra el dataset que referencia
    la versión (pudo ser distinto al actual, y pudo cambiar de columnas).
    """
    spec, errors = parse_spec(version.chart_spec)
    if spec is None:
        raise ValueError(" | ".join(errors))
    dataset = dataset_service.get_dataset(session, spec.data.dataset_id)
    if dataset is None or dataset.status == DatasetStatus.archived:
        raise ValueError("El dataset que referencia esa versión ya no existe.")
    _assert_spec_ok(spec, dataset)

    _snapshot_version(session, obj, user, f"Antes de restaurar la versión {version.version_number}")
    obj.chart_spec = version.chart_spec
    obj.dataset_id = spec.data.dataset_id
    obj.chart_type = spec.visual.chart_type
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def clone_chart(session: Session, obj: Chart, user: CurrentUser) -> Chart:
    """Clona una gráfica como recurso independiente (RF-11): conserva la spec,
    nace en borrador con autoría del usuario actual y sin historial heredado."""
    clone = Chart(
        dataset_id=obj.dataset_id,
        name=f"{obj.name} (copia)",
        description=obj.description,
        renderer=obj.renderer,
        chart_type=obj.chart_type,
        chart_spec=obj.chart_spec,
        status="draft",
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(clone)
    session.commit()
    session.refresh(clone)
    return clone


def delete_chart(session: Session, obj: Chart) -> None:
    obj.status = ChartStatus.archived.value
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


def preview_chart(connection: Connection, dataset: Dataset, chart: Chart) -> ChartPreviewResult:
    """Previsualiza una gráfica guardada ejecutando su spec (query generada)."""
    spec, errors = parse_spec(chart.chart_spec)
    if spec is None:
        raise ValueError(" | ".join(errors))
    errors, warnings = validate_spec_against_dataset(spec, dataset)
    if errors:
        # El dataset pudo cambiar después de guardar la gráfica.
        raise ValueError(" | ".join(errors))
    return preview_spec(connection, dataset, spec, {}, warnings)
