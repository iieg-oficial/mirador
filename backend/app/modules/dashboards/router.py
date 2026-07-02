"""Endpoints del módulo dashboards (tableros internos del laboratorio)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.dashboards import service
from app.modules.dashboards.models import Dashboard
from app.modules.dashboards.schemas import (
    DashboardCreate,
    DashboardDetail,
    DashboardItemRead,
    DashboardItemsUpdate,
    DashboardRead,
    DashboardUpdate,
)

router = APIRouter()


def _get_or_404(session: Session, dashboard_id: uuid.UUID) -> Dashboard:
    obj = service.get_dashboard(session, dashboard_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tablero no encontrado")
    return obj


@router.get("", response_model=list[DashboardRead])
def list_dashboards(
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.dashboards.view")),
) -> list[Dashboard]:
    return service.list_dashboards(session)


@router.post("", response_model=DashboardRead, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    data: DashboardCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.dashboards.create")),
) -> Dashboard:
    return service.create_dashboard(session, data, user)


@router.get("/{dashboard_id}", response_model=DashboardDetail)
def get_dashboard(
    dashboard_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.dashboards.view")),
) -> DashboardDetail:
    obj = _get_or_404(session, dashboard_id)
    items = service.get_items(session, dashboard_id)
    detail = DashboardDetail.model_validate(obj)
    detail.items = [DashboardItemRead.model_validate(i) for i in items]
    return detail


@router.put("/{dashboard_id}", response_model=DashboardRead)
def update_dashboard(
    dashboard_id: uuid.UUID,
    data: DashboardUpdate,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.dashboards.update")),
) -> Dashboard:
    return service.update_dashboard(session, _get_or_404(session, dashboard_id), data)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(
    dashboard_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.dashboards.delete")),
) -> None:
    service.delete_dashboard(session, _get_or_404(session, dashboard_id))


@router.put("/{dashboard_id}/items", response_model=list[DashboardItemRead])
def replace_items(
    dashboard_id: uuid.UUID,
    data: DashboardItemsUpdate,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.dashboards.update")),
) -> list[DashboardItemRead]:
    """Guarda el layout completo del grid (reemplazo en bloque, RF-13)."""
    obj = _get_or_404(session, dashboard_id)
    try:
        items = service.replace_items(session, obj, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return [DashboardItemRead.model_validate(i) for i in items]
