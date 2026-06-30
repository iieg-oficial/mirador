"""Punto de entrada de la API de Tablerillos.

Monta los routers de los módulos bajo `/api/...`. La autenticación se resuelve
siempre contra Minerva a través de `app.modules.auth` (no hay modo "sin auth"
ni proveedor alternativo; ver CLAUDE.md).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.auth.router import router as auth_router
from app.modules.charts.router import router as charts_router
from app.modules.connections.router import router as connections_router
from app.modules.datasets.router import router as datasets_router

settings = get_settings()

app = FastAPI(
    title="Tablerillos API",
    version="0.1.0",
    description="Business Intelligence institucional del IIEG.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # necesario para la cookie de sesión BFF
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(connections_router, prefix="/api/admin/connections", tags=["connections"])
app.include_router(datasets_router, prefix="/api/admin/datasets", tags=["datasets"])
app.include_router(charts_router, prefix="/api/admin/charts", tags=["charts"])


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Health check para orquestación y monitoreo."""
    return {"status": "ok"}
