import uuid
from typing import Any, Literal
from pydantic import BaseModel, Field

from app.modules.charts.spec import ChartType


ChartOutputFormat = Literal["chartspec", "echarts", "plotly"]


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
    output_format: ChartOutputFormat = "chartspec"


class ChartGenerateResponse(BaseModel):
    chart_spec: dict[str, Any] | None = None
    code: str | None = None
    code_engine: Literal["echarts", "plotly"] | None = None
    explanation: str | None = None
