"""Esquemas de entrada/salida del módulo de tags."""

import uuid
from datetime import datetime
from typing import Literal, get_args

from pydantic import BaseModel, Field

from app.modules.tags.models import TAG_COLORS

TagColor = Literal["purple", "orange", "blue", "green", "red", "amber", "teal", "gray"]

assert set(get_args(TagColor)) == set(TAG_COLORS)  # mantener schema y modelo en sync


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: TagColor = "gray"


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: TagColor | None = None


class TagRead(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}
