"""Endpoints del módulo de conexiones (§8.2).

Cada ruta exige un permiso de Minerva vía `require_permission` (la abstracción de
auth, nunca el SDK directo). Mapeo de permisos (ver `manifest.minerva.yml`):

    GET    .../              -> tablerillos.connections.view
    POST   .../              -> tablerillos.connections.create
    GET    .../{id}          -> tablerillos.connections.view
    PUT    .../{id}          -> tablerillos.connections.update
    DELETE .../{id}          -> tablerillos.connections.delete
    POST   .../{id}/test     -> tablerillos.connections.manage
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.connections import service
from app.modules.connections.models import Connection
from app.modules.connections.schemas import (
    ColumnInfo,
    ConnectionCreate,
    ConnectionRead,
    ConnectionTestResult,
    ConnectionUpdate,
    SchemaResponse,
)

router = APIRouter()


def _get_or_404(session: Session, connection_id: uuid.UUID) -> Connection:
    connection = service.get_connection(session, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")
    return connection


@router.get("", response_model=list[ConnectionRead])
def list_connections(
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.view")),
) -> list[Connection]:
    return service.list_connections(session)


@router.post("", response_model=ConnectionRead, status_code=status.HTTP_201_CREATED)
def create_connection(
    data: ConnectionCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.connections.create")),
) -> Connection:
    return service.create_connection(session, data, user)


@router.get("/{connection_id}", response_model=ConnectionRead)
def get_connection(
    connection_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.view")),
) -> Connection:
    return _get_or_404(session, connection_id)


@router.put("/{connection_id}", response_model=ConnectionRead)
def update_connection(
    connection_id: uuid.UUID,
    data: ConnectionUpdate,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.update")),
) -> Connection:
    connection = _get_or_404(session, connection_id)
    return service.update_connection(session, connection, data)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.delete")),
) -> None:
    connection = _get_or_404(session, connection_id)
    service.delete_connection(session, connection)


@router.post("/{connection_id}/test", response_model=ConnectionTestResult)
def test_connection(
    connection_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.manage")),
) -> ConnectionTestResult:
    connection = _get_or_404(session, connection_id)
    return service.test_connection(session, connection)


@router.get("/{connection_id}/schema", response_model=SchemaResponse)
def get_schema(
    connection_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.view")),
) -> SchemaResponse:
    connection = _get_or_404(session, connection_id)
    try:
        return service.get_schema(connection)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo inspeccionar el esquema: {exc}",
        )


@router.get(
    "/{connection_id}/schema/{schema_name}/{object_name}/columns",
    response_model=list[ColumnInfo],
)
def get_columns(
    connection_id: uuid.UUID,
    schema_name: str,
    object_name: str,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.connections.view")),
) -> list[ColumnInfo]:
    connection = _get_or_404(session, connection_id)
    try:
        return service.get_columns(connection, schema_name, object_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudieron obtener las columnas: {exc}",
        )
