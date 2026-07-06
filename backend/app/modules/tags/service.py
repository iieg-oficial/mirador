"""Lógica de negocio del módulo tags: CRUD + asignación a otras entidades."""

import uuid
from typing import Any

from sqlmodel import Session, select

from app.modules.auth.models import CurrentUser
from app.modules.tags.models import Tag
from app.modules.tags.schemas import TagCreate, TagUpdate


def list_tags(session: Session) -> list[Tag]:
    return list(session.exec(select(Tag).order_by(Tag.name)).all())


def get_tag(session: Session, tag_id: uuid.UUID) -> Tag | None:
    return session.get(Tag, tag_id)


def create_tag(session: Session, data: TagCreate, user: CurrentUser) -> Tag:
    tag = Tag(name=data.name, color=data.color, created_by=user.sub, created_by_email=user.email)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def update_tag(session: Session, tag: Tag, data: TagUpdate) -> Tag:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def delete_tag(session: Session, tag: Tag) -> None:
    """Borrado real (no baja lógica): un tag sin usos no tiene valor histórico.

    Las tablas de enlace tienen `ondelete=CASCADE` sobre `tag_id`, así que las
    entidades etiquetadas conservan su fila; solo pierden la relación.
    """
    session.delete(tag)
    session.commit()


def set_entity_tags(
    session: Session,
    link_model: type,
    owner_field: str,
    owner_id: uuid.UUID,
    tag_ids: list[uuid.UUID],
) -> None:
    """Reemplaza por completo las etiquetas de una entidad (no hace diff).

    Reusado por `create_connection`/`update_connection` y sus equivalentes en
    datasets/charts tras guardar la entidad.
    """
    existing: list[Any] = list(
        session.exec(select(link_model).where(getattr(link_model, owner_field) == owner_id)).all()
    )
    for row in existing:
        session.delete(row)
    for tag_id in dict.fromkeys(tag_ids):
        session.add(link_model(**{owner_field: owner_id, "tag_id": tag_id}))
    session.commit()
