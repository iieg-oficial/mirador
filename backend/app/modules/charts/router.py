"""Endpoints del módulo charts (§8.4)."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.charts import service
from app.modules.charts.models import Chart, ChartStatus, ChartVersion
from app.modules.charts.schemas import (
    ChartCreate,
    ChartPreviewResult,
    ChartRead,
    ChartSpecPayload,
    ChartSpecPreviewRequest,
    ChartUpdate,
    ChartVersionRead,
)
from app.modules.charts.spec import ChartSpecValidation
from app.modules.connections import service as conn_service
from app.modules.datasets import service as dataset_service

router = APIRouter()
log = logging.getLogger(__name__)


def _get_or_404(session: Session, chart_id: uuid.UUID) -> Chart:
    obj = service.get_chart(session, chart_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gráfica no encontrada")
    return obj


# ── Validación de ChartSpec (RF-06) ──────────────────────────────────────────


@router.post("/validate", response_model=ChartSpecValidation)
def validate_chart_spec(
    payload: ChartSpecPayload,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> ChartSpecValidation:
    """Valida una ChartSpec sin guardarla: esquema, dataset y compatibilidad."""
    return service.validate_chart_spec(session, payload.chart_spec)


# ── Preview por spec (RF-05/RF-07/RF-08) ─────────────────────────────────────


@router.post("/preview", response_model=ChartPreviewResult)
def preview_chart_spec(
    payload: ChartSpecPreviewRequest,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> ChartPreviewResult:
    """Previsualiza una spec sin guardarla: genera la consulta segura desde la
    ChartSpec (agregación server-side) y devuelve filas + SQL generado."""
    try:
        spec, dataset, warnings = service.resolve_spec(session, payload.chart_spec)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    connection = conn_service.get_connection(session, dataset.connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")

    try:
        return service.preview_spec(connection, dataset, spec, payload.params, warnings)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al ejecutar la consulta generada desde la ChartSpec")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al ejecutar la consulta generada.",
        ) from exc


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ChartRead])
def list_charts(
    status_filter: ChartStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    tag_ids: list[uuid.UUID] | None = Query(default=None),
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> list[Chart]:
    """Sin filtro excluye archivadas; con ?status= devuelve solo ese estado."""
    return service.list_charts(session, status_filter, q, tag_ids)


@router.post("", response_model=ChartRead, status_code=status.HTTP_201_CREATED)
def create_chart(
    data: ChartCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.charts.create")),
) -> Chart:
    dataset = dataset_service.get_dataset(session, data.chart_spec.data.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")
    try:
        return service.create_chart(session, data, user, dataset)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{chart_id}", response_model=ChartRead)
def get_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> Chart:
    return _get_or_404(session, chart_id)


@router.put("/{chart_id}", response_model=ChartRead)
def update_chart(
    chart_id: uuid.UUID,
    data: ChartUpdate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.charts.update")),
) -> Chart:
    obj = _get_or_404(session, chart_id)
    # Si la spec cambia puede apuntar a otro dataset; se valida contra ese.
    target_dataset_id = (
        data.chart_spec.data.dataset_id if data.chart_spec is not None else obj.dataset_id
    )
    dataset = dataset_service.get_dataset(session, target_dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")
    try:
        return service.update_chart(session, obj, data, dataset, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.delete")),
) -> None:
    service.delete_chart(session, _get_or_404(session, chart_id))


# ── Clonado (RF-11) ───────────────────────────────────────────────────────────


@router.post("/{chart_id}/clone", response_model=ChartRead, status_code=status.HTTP_201_CREATED)
def clone_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.charts.create")),
) -> Chart:
    """Clona la gráfica como una nueva independiente (borrador, sin historial)."""
    return service.clone_chart(session, _get_or_404(session, chart_id), user)


# ── Versionado (RF-12) ────────────────────────────────────────────────────────


@router.get("/{chart_id}/versions", response_model=list[ChartVersionRead])
def list_chart_versions(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> list[ChartVersion]:
    """Historial de versiones de la gráfica, de la más reciente a la más antigua."""
    _get_or_404(session, chart_id)
    return service.list_versions(session, chart_id)


@router.post("/{chart_id}/restore/{version_id}", response_model=ChartRead)
def restore_chart_version(
    chart_id: uuid.UUID,
    version_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.charts.update")),
) -> Chart:
    """Restaura el spec de una versión anterior (el vigente queda en el historial)."""
    obj = _get_or_404(session, chart_id)
    version = session.get(ChartVersion, version_id)
    if version is None or version.chart_id != chart_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versión no encontrada")
    try:
        return service.restore_version(session, obj, version, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


# ── Preview ───────────────────────────────────────────────────────────────────


@router.post("/{chart_id}/preview", response_model=ChartPreviewResult)
def preview_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> ChartPreviewResult:
    """Ejecuta la consulta generada desde la spec guardada de la gráfica."""
    chart = _get_or_404(session, chart_id)

    dataset = dataset_service.get_dataset(session, chart.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")

    connection = conn_service.get_connection(session, dataset.connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")

    try:
        return service.preview_chart(connection, dataset, chart)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al ejecutar el dataset de la gráfica")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al ejecutar el dataset.",
        ) from exc
