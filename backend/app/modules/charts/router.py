"""Endpoints del módulo charts (§8.4)."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.charts import service
from app.modules.charts.models import Chart
from app.modules.charts.schemas import ChartCreate, ChartRead, ChartSpecPayload, ChartUpdate
from app.modules.charts.spec import ChartSpecValidation
from app.modules.connections import service as conn_service
from app.modules.datasets import service as dataset_service
from app.modules.datasets.schemas import PreviewResult

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


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ChartRead])
def list_charts(
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> list[Chart]:
    return service.list_charts(session)


@router.post("", response_model=ChartRead, status_code=status.HTTP_201_CREATED)
def create_chart(
    data: ChartCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.charts.create")),
) -> Chart:
    dataset = dataset_service.get_dataset(session, data.dataset_id)
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
    _: CurrentUser = Depends(require_permission("tablerillos.charts.update")),
) -> Chart:
    obj = _get_or_404(session, chart_id)
    dataset = dataset_service.get_dataset(session, obj.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")
    try:
        return service.update_chart(session, obj, data, dataset)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.delete")),
) -> None:
    service.delete_chart(session, _get_or_404(session, chart_id))


# ── Preview ───────────────────────────────────────────────────────────────────


@router.post("/{chart_id}/preview", response_model=PreviewResult)
def preview_chart(
    chart_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.charts.view")),
) -> PreviewResult:
    """Ejecuta el dataset de la gráfica y devuelve datos para renderizar en el cliente."""
    chart = _get_or_404(session, chart_id)

    dataset = dataset_service.get_dataset(session, chart.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")

    connection = conn_service.get_connection(session, dataset.connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")

    try:
        return service.preview_chart(connection, dataset)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        log.exception("Error al ejecutar el dataset de la gráfica")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al ejecutar el dataset.",
        ) from exc
