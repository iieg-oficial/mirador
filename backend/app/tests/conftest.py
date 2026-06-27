"""Fixtures compartidas de tests.

La auth real es siempre Minerva; en tests se sustituye **aquí** (nunca en el
código de la app) mediante `dependency_overrides` para `get_current_user` y un
no-op para la verificación de permisos. Así los tests no requieren ni Minerva ni
el `minerva-sdk` instalado. También se configura una clave Fernet y una base
SQLite en memoria que sustituye a `get_session`.
"""

import os

# Debe ejecutarse antes de importar config/security/app (lru_cache de settings).
os.environ.setdefault("ENVIRONMENT", "development")
from cryptography.fernet import Fernet  # noqa: E402

os.environ.setdefault("SECRET_ENCRYPTION_KEY", Fernet.generate_key().decode())

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import app.models  # noqa: E402,F401 — registra todas las tablas en metadata
from app.core.database import get_session  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.modules.auth import minerva  # noqa: E402
from app.modules.auth.deps import get_current_user  # noqa: E402
from app.modules.auth.models import CurrentUser  # noqa: E402

# Usuario de prueba con rol → pasa get_current_user y require_app_access.
TEST_USER = CurrentUser(sub="test-user", email="test@iieg.test", name="Test", roles=["tester"])


async def _grant_all_permissions(request, user, permission):  # type: ignore[no-untyped-def]
    """Sustituye la verificación de permisos contra Minerva en tests (concede todo)."""
    return None


# Mock de auth, válido SOLO en testing (ver docstring del módulo).
minerva.assert_permission = _grant_all_permissions  # type: ignore[assignment]


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        yield session

    fastapi_app.dependency_overrides[get_session] = get_session_override
    fastapi_app.dependency_overrides[get_current_user] = lambda: TEST_USER
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()
