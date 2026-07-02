"""Engine y sesión de SQLModel para la base de metadata de Tablerillos.

Sesiones **síncronas**: simples y suficientes para el CRUD de metadata (FastAPI
las ejecuta en un threadpool). La ejecución de queries contra las bases de datos
externas registradas (módulo de datasets) usará conexiones aparte, una por
`Connection`, y no este engine.
"""

from collections.abc import Iterator

from sqlmodel import Session, create_engine

from app.core.config import get_settings

_settings = get_settings()

# `create_engine` no abre conexión hasta el primer uso, así que importar este
# módulo no requiere una base disponible (útil en tests/CI).
engine = create_engine(
    _settings.DATABASE_URL,
    echo=_settings.DEBUG,
    pool_pre_ping=True,
)


def get_session() -> Iterator[Session]:
    """Dependency de FastAPI: una sesión por request."""
    with Session(engine) as session:
        yield session
