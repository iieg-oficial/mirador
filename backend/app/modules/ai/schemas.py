import uuid
from pydantic import BaseModel, Field
from typing import Any

from app.modules.charts.spec import ChartType


class QueryGenerateRequest(BaseModel):
    connection_id: uuid.UUID
    prompt: str = Field(min_length=1)
    current_sql: str | None = None


class QueryGenerateResponse(BaseModel):
    sql: str
    explanation: str | None = None


class ChartGenerateRequest(BaseModel):
    dataset_id: uuid.UUID
    prompt: str = Field(min_length=1)
    current_spec: dict[str, Any] | None = None
    chart_type: ChartType | None = None


class ChartGenerateResponse(BaseModel):
    chart_spec: dict[str, Any]
    explanation: str | None = None
