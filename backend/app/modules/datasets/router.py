"""Endpoints del módulo datasets (§8.3)."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.connections import service as conn_service
from app.modules.datasets import service
from app.modules.datasets.models import Dataset
from app.modules.datasets.schemas import (
    DatasetCreate,
    DatasetRead,
    DatasetUpdate,
    PlaygroundRequest,
    PreviewRequest,
    PreviewResult,
)

router = APIRouter()
log = logging.getLogger(__name__)


def _get_or_404(session: Session, dataset_id: uuid.UUID) -> Dataset:
    obj = service.get_dataset(session, dataset_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")
    return obj


def _get_connection_or_404(session: Session, connection_id: uuid.UUID):  # type: ignore[return]
    conn = conn_service.get_connection(session, connection_id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")
    return conn


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[DatasetRead])
def list_datasets(
    q: str | None = Query(default=None),
    tag_ids: list[uuid.UUID] | None = Query(default=None),
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.view")),
) -> list[Dataset]:
    return service.list_datasets(session, q, tag_ids)


@router.post("", response_model=DatasetRead, status_code=status.HTTP_201_CREATED)
def create_dataset(
    data: DatasetCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.datasets.create")),
) -> Dataset:
    connection = _get_connection_or_404(session, data.connection_id)
    try:
        return service.create_dataset(session, data, user, connection)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un dataset con ese slug.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al validar el dataset contra la BD externa")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al validar la consulta contra la base de datos.",
        ) from exc


@router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.view")),
) -> Dataset:
    return _get_or_404(session, dataset_id)


@router.put("/{dataset_id}", response_model=DatasetRead)
def update_dataset(
    dataset_id: uuid.UUID,
    data: DatasetUpdate,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.update")),
) -> Dataset:
    obj = _get_or_404(session, dataset_id)
    connection = _get_connection_or_404(session, obj.connection_id)
    try:
        return service.update_dataset(session, obj, data, connection)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al validar el dataset contra la BD externa")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al validar la consulta contra la base de datos.",
        ) from exc


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.delete")),
) -> None:
    obj = _get_or_404(session, dataset_id)
    service.delete_dataset(session, obj)


# ── Validación y preview ──────────────────────────────────────────────────────


@router.post("/{dataset_id}/validate", response_model=DatasetRead)
def validate_dataset(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.update")),
) -> Dataset:
    obj = _get_or_404(session, dataset_id)
    connection = _get_connection_or_404(session, obj.connection_id)
    try:
        return service.validate_dataset(session, obj, connection)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al validar el dataset contra la BD externa")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al validar la consulta contra la base de datos.",
        ) from exc


@router.post("/{dataset_id}/preview", response_model=PreviewResult)
def preview_dataset(
    dataset_id: uuid.UUID,
    body: PreviewRequest,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.view")),
) -> PreviewResult:
    obj = _get_or_404(session, dataset_id)
    connection = _get_connection_or_404(session, obj.connection_id)
    try:
        return service.run_query(
            connection,
            obj.sql_query,
            body.params,
            obj.max_rows,
            dataset_id=str(obj.id),
            cache_ttl_seconds=obj.cache_ttl_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al ejecutar el dataset contra la BD externa")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al ejecutar el dataset.",
        ) from exc


# ── Playground (ejecución ad-hoc sin guardar) ─────────────────────────────────


@router.post("/playground", response_model=PreviewResult)
def playground(
    body: PlaygroundRequest,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.datasets.create")),
) -> PreviewResult:
    """Ejecuta SQL ad-hoc contra una conexión sin necesidad de guardar un dataset."""
    connection = _get_connection_or_404(session, body.connection_id)
    try:
        return service.run_query(connection, body.sql, body.params, body.max_rows)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error al ejecutar la consulta del playground")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al ejecutar la consulta.",
        ) from exc
