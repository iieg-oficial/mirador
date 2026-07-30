from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.modules.ai import service
from app.modules.ai.provider import AIProvider, get_ai_provider
from app.modules.ai.schemas import (
    ChartGenerateRequest,
    ChartGenerateResponse,
    QueryGenerateRequest,
    QueryGenerateResponse,
)
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser

router = APIRouter()


@router.post("/query/generate", response_model=QueryGenerateResponse)
def generate_query(
    data: QueryGenerateRequest,
    session: Session = Depends(get_session),
    provider: AIProvider = Depends(get_ai_provider),
    _: CurrentUser = Depends(require_permission("tablerillos.ai.use")),
) -> QueryGenerateResponse:
    return service.generate_query(session, provider, data)


@router.post("/charts/generate", response_model=ChartGenerateResponse)
def generate_chart(
    data: ChartGenerateRequest,
    session: Session = Depends(get_session),
    provider: AIProvider = Depends(get_ai_provider),
    _: CurrentUser = Depends(require_permission("tablerillos.ai.use")),
) -> ChartGenerateResponse:
    return service.generate_chart(session, provider, data)
