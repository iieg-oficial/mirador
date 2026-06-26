"""Fixtures compartidas de tests.

Configura una clave Fernet y el proveedor de auth *antes* de importar la app, y
expone una base de datos SQLite en memoria que sustituye a `get_session` para
probar el CRUD sin Postgres real.
"""

import os

# Debe ejecutarse antes de importar config/security/app (lru_cache de settings).
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("AUTH_PROVIDER", "stub")
from cryptography.fernet import Fernet  # noqa: E402

os.environ.setdefault("SECRET_ENCRYPTION_KEY", Fernet.generate_key().decode())

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import app.models  # noqa: E402,F401 — registra todas las tablas en metadata
from app.core.database import get_session  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


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
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()
