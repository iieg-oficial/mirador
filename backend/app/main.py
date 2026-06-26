"""Punto de entrada de la API de Tablerillos.

Fase 0 (andamiaje): solo expone metadatos y un health check. Los routers de
cada módulo (auth, connections, datasets, charts, dashboards, public, ...) se
montarán en las fases siguientes.
"""

from fastapi import FastAPI

app = FastAPI(
    title="Tablerillos API",
    version="0.1.0",
    description="Business Intelligence institucional del IIEG.",
)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Health check para orquestación y monitoreo."""
    return {"status": "ok"}


# Los routers se registran aquí en fases posteriores, por ejemplo:
#   from app.modules.auth.router import router as auth_router
#   app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
