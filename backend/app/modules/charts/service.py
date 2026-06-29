"""Lógica de negocio del módulo charts: CRUD + preview (§6.5)."""

import uuid

from sqlmodel import Session, select

from app.modules.auth.models import CurrentUser
from app.modules.charts.models import Chart
from app.modules.charts.schemas import ChartCreate, ChartUpdate
from app.modules.connections.models import Connection
from app.modules.datasets.models import Dataset
from app.modules.datasets.schemas import PreviewResult
from app.modules.datasets import service as dataset_service


def list_charts(session: Session) -> list[Chart]:
    return list(
        session.exec(select(Chart).where(Chart.status != "archived")).all()
    )


def get_chart(session: Session, chart_id: uuid.UUID) -> Chart | None:
    return session.get(Chart, chart_id)


def create_chart(session: Session, data: ChartCreate, user: CurrentUser) -> Chart:
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


def update_chart(session: Session, obj: Chart, data: ChartUpdate) -> Chart:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def delete_chart(session: Session, obj: Chart) -> None:
    obj.status = "archived"
    session.add(obj)
    session.commit()


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
