"""Lógica de negocio de dashboards: CRUD + guardado del layout en bloque.

El layout se reemplaza completo en cada PUT /items (así entrega su estado
react-grid-layout); no hay CRUD por item.
"""

import uuid

from sqlmodel import Session, select

from app.modules.auth.models import CurrentUser
from app.modules.charts.models import Chart, ChartStatus
from app.modules.dashboards.models import Dashboard, DashboardItem, DashboardStatus
from app.modules.dashboards.schemas import (
    DashboardCreate,
    DashboardItemsUpdate,
    DashboardUpdate,
)


def list_dashboards(session: Session) -> list[Dashboard]:
    return list(
        session.exec(
            select(Dashboard).where(Dashboard.status != DashboardStatus.archived.value)
        ).all()
    )


def get_dashboard(session: Session, dashboard_id: uuid.UUID) -> Dashboard | None:
    return session.get(Dashboard, dashboard_id)


def get_items(session: Session, dashboard_id: uuid.UUID) -> list[DashboardItem]:
    return list(
        session.exec(
            select(DashboardItem).where(DashboardItem.dashboard_id == dashboard_id)
        ).all()
    )


def create_dashboard(session: Session, data: DashboardCreate, user: CurrentUser) -> Dashboard:
    obj = Dashboard(**data.model_dump(), created_by=user.sub, created_by_email=user.email)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def update_dashboard(session: Session, obj: Dashboard, data: DashboardUpdate) -> Dashboard:
    fields = data.model_dump(exclude_unset=True, mode="json")
    for key, value in fields.items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def delete_dashboard(session: Session, obj: Dashboard) -> None:
    obj.status = DashboardStatus.archived.value
    session.add(obj)
    session.commit()


def replace_items(
    session: Session, dashboard: Dashboard, data: DashboardItemsUpdate
) -> list[DashboardItem]:
    """Reemplaza el layout completo del dashboard (RF-13).

    Valida que cada item de tipo chart apunte a una gráfica existente y no
    archivada antes de tocar nada.
    """
    chart_ids = {i.chart_id for i in data.items if i.item_type == "chart"}
    if None in chart_ids:
        raise ValueError("Todo item de tipo 'chart' requiere chart_id.")
    for chart_id in chart_ids:
        chart = session.get(Chart, chart_id)
        if chart is None or chart.status == ChartStatus.archived.value:
            raise ValueError(f"La gráfica {chart_id} no existe o está archivada.")

    for old in get_items(session, dashboard.id):
        session.delete(old)
    new_items = [
        DashboardItem(
            dashboard_id=dashboard.id,
            chart_id=item.chart_id,
            item_type=item.item_type,
            position_config=item.position_config.model_dump(),
            local_config=item.local_config,
        )
        for item in data.items
    ]
    session.add_all(new_items)
    session.commit()
    for item in new_items:
        session.refresh(item)
    return new_items
