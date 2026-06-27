"""Punto de entrada de la API de Tablerillos.

Monta los routers de los módulos bajo `/api/...`. La autenticación se resuelve a
través de la abstracción `app.modules.auth` (stub en dev, Minerva en prod).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.auth.router import router as auth_router
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


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Health check para orquestación y monitoreo."""
    return {"status": "ok"}
