"""Tests del módulo de IA: generación asistida de SQL y ChartSpec.

El proveedor de IA (OpenAI/LangChain) NUNCA se llama de verdad: se sustituye con
un `FakeAIProvider` inyectado vía `dependency_overrides[get_ai_provider]`, igual
que la auth se sustituye en `conftest.py`. La salida del proveedor siempre se
revalida en el backend (`sql_guard` / `parse_spec` + `validate_spec_against_dataset`).

`_infer_schema`, `get_schema` y `get_columns` se mockean: requieren una BD
Postgres real, fuera de alcance para estos tests.
"""

import json
from typing import Any

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.modules.ai.provider import AIProviderError, get_ai_provider
from app.modules.auth import minerva
from app.modules.connections import service as connections_service
from app.modules.connections.schemas import (
    ColumnInfo,
    SchemaGroup,
    SchemaObject,
    SchemaObjectType,
    SchemaResponse,
)
from app.modules.datasets import service as datasets_service

_CONNECTION_PAYLOAD = {
    "name": "DW Test",
    "engine": "postgresql",
    "host": "db.interno",
    "port": 5432,
    "database": "indicadores",
    "username": "lector",
    "password": "s3creto-real",
    "ssl_enabled": False,
    "read_only": True,
}

_DATASET_PAYLOAD = {
    "name": "Población municipal",
    "slug": "poblacion_municipal",
    "sql_query": "SELECT municipio, anio, poblacion FROM mart.poblacion",
    "max_rows": 1000,
    "cache_ttl_seconds": 300,
}

_SCHEMA_COLS = ["municipio", "anio", "poblacion"]


class FakeAIProvider:
    """Proveedor de IA de prueba: devuelve una respuesta fija, sin red."""

    def __init__(self, response: str = "", error: Exception | None = None) -> None:
        self._response = response
        self._error = error

    def complete(self, *, system_prompt: str, user_prompt: str) -> str:
        if self._error is not None:
            raise self._error
        return self._response


def _use_provider(provider: FakeAIProvider) -> None:
    fastapi_app.dependency_overrides[get_ai_provider] = lambda: provider


@pytest.fixture(autouse=True)
def _mock_external_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """Evita cualquier acceso a una BD Postgres real."""

    def fake_infer_schema(connection, sql):  # type: ignore[no-untyped-def]
        return ([{"name": c, "data_type": "text"} for c in _SCHEMA_COLS], [])

    def fake_get_schema(connection):  # type: ignore[no-untyped-def]
        return SchemaResponse(
            schemas=[
                SchemaGroup(
                    name="mart",
                    objects=[SchemaObject(name="poblacion", type=SchemaObjectType.table)],
                )
            ]
        )

    def fake_get_columns(connection, schema_name, object_name):  # type: ignore[no-untyped-def]
        return [
            ColumnInfo(name=c, data_type="text", nullable=True, default=None) for c in _SCHEMA_COLS
        ]

    monkeypatch.setattr(datasets_service, "_infer_schema", fake_infer_schema)
    monkeypatch.setattr(connections_service, "get_schema", fake_get_schema)
    monkeypatch.setattr(connections_service, "get_columns", fake_get_columns)


def _create_connection(client: TestClient) -> str:
    res = client.post("/api/admin/connections", json=_CONNECTION_PAYLOAD)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _create_dataset(client: TestClient) -> str:
    connection_id = _create_connection(client)
    res = client.post(
        "/api/admin/datasets", json={**_DATASET_PAYLOAD, "connection_id": connection_id}
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _valid_spec(dataset_id: str) -> dict[str, Any]:
    return {
        "version": "1.0",
        "data": {"dataset_id": dataset_id, "filters": [], "sort": [], "limit": 100},
        "visual": {"chart_type": "bar", "title": "Población por municipio"},
        "encodings": {
            "x": [{"field": "municipio"}],
            "y": [{"field": "poblacion", "aggregation": "sum"}],
        },
    }


# ── /query/generate ────────────────────────────────────────────────────────────


def test_query_generate_ok(client: TestClient) -> None:
    connection_id = _create_connection(client)
    _use_provider(
        FakeAIProvider(
            json.dumps(
                {
                    "sql": "SELECT municipio, poblacion FROM mart.poblacion",
                    "explanation": "Selecciona municipio y población.",
                }
            )
        )
    )
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "dame municipio y población"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "SELECT" in body["sql"].upper()
    assert body["explanation"]


def test_query_generate_rejects_write_sql(client: TestClient) -> None:
    connection_id = _create_connection(client)
    _use_provider(FakeAIProvider(json.dumps({"sql": "DROP TABLE mart.poblacion"})))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "borra la tabla"},
    )
    assert res.status_code == 422, res.text


def test_query_generate_rejects_multi_statement(client: TestClient) -> None:
    connection_id = _create_connection(client)
    _use_provider(FakeAIProvider(json.dumps({"sql": "SELECT 1; SELECT 2"})))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "dos consultas"},
    )
    assert res.status_code == 422, res.text


def test_query_generate_strips_code_fence(client: TestClient) -> None:
    connection_id = _create_connection(client)
    # Fence con el identificador de lenguaje pegado al JSON, sin salto de línea.
    fenced = '```json{"sql": "SELECT municipio FROM mart.poblacion"}```'
    _use_provider(FakeAIProvider(fenced))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "municipios"},
    )
    assert res.status_code == 200, res.text
    assert "SELECT" in res.json()["sql"].upper()


def test_query_generate_missing_sql_key_returns_422(client: TestClient) -> None:
    connection_id = _create_connection(client)
    _use_provider(FakeAIProvider(json.dumps({"foo": "bar"})))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "algo"},
    )
    assert res.status_code == 422, res.text


# ── /charts/generate ─────────────────────────────────────────────────────────


def test_chart_generate_ok(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    _use_provider(
        FakeAIProvider(
            json.dumps(
                {
                    "chart_spec": _valid_spec(dataset_id),
                    "explanation": "Gráfica de barras.",
                }
            )
        )
    )
    res = client.post(
        "/api/admin/ai/charts/generate",
        json={"dataset_id": dataset_id, "prompt": "barras de población por municipio"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["chart_spec"]["visual"]["chart_type"] == "bar"
    assert body["chart_spec"]["data"]["dataset_id"] == dataset_id


def test_chart_generate_invalid_spec_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    bad_spec = _valid_spec(dataset_id)
    # kpi requiere exactamente una métrica con agregación; esta spec no cumple.
    bad_spec["visual"]["chart_type"] = "kpi"
    bad_spec["encodings"] = {"x": [{"field": "municipio"}], "y": []}
    _use_provider(FakeAIProvider(json.dumps({"chart_spec": bad_spec})))
    res = client.post(
        "/api/admin/ai/charts/generate",
        json={"dataset_id": dataset_id, "prompt": "un kpi"},
    )
    assert res.status_code == 422, res.text


def test_chart_generate_unknown_column_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    bad_spec = _valid_spec(dataset_id)
    bad_spec["encodings"]["x"] = [{"field": "inexistente"}]
    _use_provider(FakeAIProvider(json.dumps({"chart_spec": bad_spec})))
    res = client.post(
        "/api/admin/ai/charts/generate",
        json={"dataset_id": dataset_id, "prompt": "columna que no existe"},
    )
    assert res.status_code == 422, res.text
    assert "inexistente" in res.text


def test_chart_generate_missing_chart_spec_key_returns_422(client: TestClient) -> None:
    dataset_id = _create_dataset(client)
    _use_provider(FakeAIProvider(json.dumps({"foo": "bar"})))
    res = client.post(
        "/api/admin/ai/charts/generate",
        json={"dataset_id": dataset_id, "prompt": "algo"},
    )
    assert res.status_code == 422, res.text


# ── Resiliencia / límites / permisos ──────────────────────────────────────────


def test_provider_unavailable_returns_503(client: TestClient) -> None:
    connection_id = _create_connection(client)
    _use_provider(FakeAIProvider(error=AIProviderError("sin API key")))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "hola"},
    )
    assert res.status_code == 503, res.text
    # El motivo interno nunca se filtra al cliente.
    assert "API key" not in res.text


def test_prompt_too_long_returns_422(client: TestClient) -> None:
    connection_id = _create_connection(client)
    from app.core.config import get_settings

    _use_provider(FakeAIProvider(json.dumps({"sql": "SELECT 1"})))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={
            "connection_id": connection_id,
            "prompt": "x" * (get_settings().AI_MAX_PROMPT_CHARS + 1),
        },
    )
    assert res.status_code == 422, res.text


def test_missing_permission_returns_403(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    connection_id = _create_connection(client)

    async def deny_ai_use(request, user, permission):  # type: ignore[no-untyped-def]
        if permission == "tablerillos.ai.use":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
        return None

    monkeypatch.setattr(minerva, "assert_permission", deny_ai_use)
    _use_provider(FakeAIProvider(json.dumps({"sql": "SELECT 1"})))
    res = client.post(
        "/api/admin/ai/query/generate",
        json={"connection_id": connection_id, "prompt": "hola"},
    )
    assert res.status_code == 403, res.text
