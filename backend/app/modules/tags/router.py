"""Endpoints del módulo de tags.

GET    .../      -> tablerillos.tags.view
POST   .../      -> tablerillos.tags.create
PUT    .../{id}  -> tablerillos.tags.update
DELETE .../{id}  -> tablerillos.tags.delete
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.tags import service
from app.modules.tags.models import Tag
from app.modules.tags.schemas import TagCreate, TagRead, TagUpdate

router = APIRouter()


def _get_or_404(session: Session, tag_id: uuid.UUID) -> Tag:
    tag = service.get_tag(session, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    return tag


@router.get("", response_model=list[TagRead])
def list_tags(
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.tags.view")),
) -> list[Tag]:
    return service.list_tags(session)


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(
    data: TagCreate,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.tags.create")),
) -> Tag:
    try:
        return service.create_tag(session, data, user)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ya existe una etiqueta con ese nombre."
        ) from exc


@router.put("/{tag_id}", response_model=TagRead)
def update_tag(
    tag_id: uuid.UUID,
    data: TagUpdate,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.tags.update")),
) -> Tag:
    tag = _get_or_404(session, tag_id)
    try:
        return service.update_tag(session, tag, data)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ya existe una etiqueta con ese nombre."
        ) from exc


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.tags.delete")),
) -> None:
    service.delete_tag(session, _get_or_404(session, tag_id))
