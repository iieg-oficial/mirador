"""Punto de entrada de la API de Tablerillos.

Monta los routers de los módulos bajo `/api/...`. La autenticación se resuelve
siempre contra Minerva a través de `app.modules.auth` (no hay modo "sin auth"
ni proveedor alternativo; ver CLAUDE.md).
"""

import logging

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core import database
from app.core.config import get_settings
from app.modules.auth import session as auth_session
from app.modules.auth.deps import require_app_access
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.charts.router import router as charts_router
from app.modules.connections.router import router as connections_router
from app.modules.dashboards.router import router as dashboards_router
from app.modules.datasets.router import router as datasets_router
from app.modules.tags.router import router as tags_router

settings = get_settings()

logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(
    title="Tablerillos API",
    version="0.2.1",
    description="Business Intelligence institucional del IIEG.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # necesario para la cookie de sesión BFF
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Red de seguridad: registra el traceback y responde 500 genérico.

    Las HTTPException con status intencional las maneja el handler por defecto de
    Starlette; aquí solo caen las excepciones no previstas, que no deben filtrar
    detalles internos al cliente.
    """
    if isinstance(exc, StarletteHTTPException):
        raise exc
    log.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})


# El gate `require_app_access` exige ≥1 rol en Tablerillos antes de los permisos
# finos de cada endpoint (ver CLAUDE.md). `/api/auth` queda fuera a propósito:
# /me y el flujo OIDC deben responder aunque el usuario aún no tenga rol.
_admin = [Depends(require_app_access)]

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(
    connections_router, prefix="/api/admin/connections", tags=["connections"], dependencies=_admin
)
app.include_router(
    datasets_router, prefix="/api/admin/datasets", tags=["datasets"], dependencies=_admin
)
app.include_router(charts_router, prefix="/api/admin/charts", tags=["charts"], dependencies=_admin)
app.include_router(
    dashboards_router, prefix="/api/admin/dashboards", tags=["dashboards"], dependencies=_admin
)
app.include_router(tags_router, prefix="/api/admin/tags", tags=["tags"], dependencies=_admin)
app.include_router(ai_router, prefix="/api/admin/ai", tags=["ai"], dependencies=_admin)


@app.get("/health", tags=["meta"])
def health() -> JSONResponse:
    """Health check para orquestación y monitoreo: verifica metadata DB y Redis."""
    components: dict[str, str] = {}

    try:
        with database.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        components["database"] = "ok"
    except Exception:  # noqa: BLE001
        log.exception("Health check: base de metadata no disponible")
        components["database"] = "error"

    try:
        auth_session.get_redis().ping()
        components["redis"] = "ok"
    except Exception:  # noqa: BLE001
        log.exception("Health check: Redis no disponible")
        components["redis"] = "error"

    healthy = all(v == "ok" for v in components.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "error", "components": components},
    )
