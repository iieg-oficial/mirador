import json
import logging
import re
import uuid

import psycopg
from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.config import get_settings
from app.core.sql_guard import normalize_sql, validate_sql
from app.modules.ai import prompts
from app.modules.ai.provider import AIProvider, AIProviderError
from app.modules.ai.schemas import (
    ChartGenerateRequest,
    ChartGenerateResponse,
    QueryGenerateRequest,
    QueryGenerateResponse,
)
from app.modules.charts.spec import parse_spec, validate_spec_against_dataset
from app.modules.connections import service as connections_service
from app.modules.connections.models import Connection
from app.modules.datasets import service as datasets_service
from app.modules.datasets.models import Dataset

logger = logging.getLogger(__name__)

_MAX_SCHEMA_OBJECTS = 40


def _unprocessable(detail: str) -> HTTPException:
    """422 uniforme para toda salida de IA que no supera la validación."""
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _check_prompt_length(prompt: str) -> None:
    limit = get_settings().AI_MAX_PROMPT_CHARS
    if len(prompt) > limit:
        raise _unprocessable(f"El prompt excede el máximo de {limit} caracteres.")


def _complete(provider: AIProvider, *, system_prompt: str, user_prompt: str) -> str:
    """Punto único de llamada al proveedor: traduce cualquier fallo a 503."""
    try:
        return provider.complete(system_prompt=system_prompt, user_prompt=user_prompt)
    except AIProviderError as exc:
        # Se registra solo la categoría del fallo (timeout, rate limit, etc.), no
        # el mensaje crudo: podría arrastrar cabeceras con la API key.
        cause = exc.__cause__ or exc
        logger.warning("Proveedor de IA no disponible (%s)", type(cause).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=("El servicio de IA no está disponible en este momento. Inténtalo más tarde."),
        ) from exc


def _strip_code_fence(text: str) -> str:
    """Quita un envoltorio ```json ... ``` que algunos modelos añaden pese a las
    instrucciones. Tolera el identificador de lenguaje pegado al contenido, con o
    sin salto de línea (```json{...} o ```json\\n{...})."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    stripped = stripped[3:]
    if stripped.rstrip().endswith("```"):
        stripped = stripped.rstrip()[:-3]
    # Quita un posible identificador de lenguaje inicial (json, sql, …) y un salto.
    stripped = re.sub(r"^[a-zA-Z0-9]*\n?", "", stripped, count=1)
    return stripped.strip()


def _parse_json_output(raw: str) -> dict:
    try:
        data = json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError as exc:
        raise _unprocessable("La IA no devolvió una respuesta con el formato esperado.") from exc
    if not isinstance(data, dict):
        raise _unprocessable("La IA no devolvió un objeto válido.")
    return data


def _get_connection_or_404(session: Session, connection_id: uuid.UUID) -> Connection:
    connection = connections_service.get_connection(session, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conexión no encontrada")
    return connection


def _get_dataset_or_404(session: Session, dataset_id: uuid.UUID) -> Dataset:
    dataset = datasets_service.get_dataset(session, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset no encontrado")
    return dataset


def _build_connection_schema_context(connection: Connection) -> str:
    """Contexto de esquema para la generación de SQL, reusando el explorador de
    conexiones (excluye esquemas de sistema). Acotado a `_MAX_SCHEMA_OBJECTS`.

    Si la BD externa no responde → 503 (mismo patrón que datasets)."""
    try:
        schema = connections_service.get_schema(connection)
        objects: list[prompts.SchemaObject] = []
        for group in schema.schemas:
            for obj in group.objects:
                if len(objects) >= _MAX_SCHEMA_OBJECTS:
                    break
                columns = connections_service.get_columns(connection, group.name, obj.name)
                objects.append(
                    prompts.SchemaObject(
                        group.name, obj.name, [f"{c.name} {c.data_type}" for c in columns]
                    )
                )
            if len(objects) >= _MAX_SCHEMA_OBJECTS:
                break
    except psycopg.OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "No se pudo leer el esquema de la base de datos externa. "
                "Verifica la conexión o inténtalo más tarde."
            ),
        ) from exc
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return prompts.render_connection_schema(objects)


def generate_query(
    session: Session, provider: AIProvider, req: QueryGenerateRequest
) -> QueryGenerateResponse:
    _check_prompt_length(req.prompt)
    connection = _get_connection_or_404(session, req.connection_id)

    schema_context = _build_connection_schema_context(connection)
    system_prompt = prompts.build_query_system_prompt(schema_context)
    user_prompt = prompts.build_query_user_prompt(req.prompt, req.current_sql)

    raw = _complete(provider, system_prompt=system_prompt, user_prompt=user_prompt)
    data = _parse_json_output(raw)

    sql = data.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise _unprocessable("La IA no devolvió una consulta SQL.")
    try:
        validate_sql(sql)
    except ValueError as exc:
        raise _unprocessable(f"La IA generó SQL no permitido: {exc}") from exc

    explanation = data.get("explanation")
    return QueryGenerateResponse(
        sql=normalize_sql(sql),
        explanation=explanation if isinstance(explanation, str) else None,
    )


def generate_chart(
    session: Session, provider: AIProvider, req: ChartGenerateRequest
) -> ChartGenerateResponse:
    _check_prompt_length(req.prompt)
    dataset = _get_dataset_or_404(session, req.dataset_id)

    dataset_context = prompts.render_dataset_context(dataset)
    system_prompt = prompts.build_chart_system_prompt(dataset_context, req.chart_type)
    user_prompt = prompts.build_chart_user_prompt(req.prompt, req.current_spec, req.chart_type)

    raw = _complete(provider, system_prompt=system_prompt, user_prompt=user_prompt)
    data = _parse_json_output(raw)

    spec_raw = data.get("chart_spec")
    if not isinstance(spec_raw, dict):
        raise _unprocessable("La IA no devolvió una ChartSpec.")

    data_section = spec_raw.get("data")
    if not isinstance(data_section, dict):
        data_section = {}
        spec_raw["data"] = data_section
    data_section["dataset_id"] = str(dataset.id)

    spec, errors = parse_spec(spec_raw)
    if spec is None:
        raise _unprocessable("La IA generó una ChartSpec inválida: " + "; ".join(errors))
    validation_errors, _warnings = validate_spec_against_dataset(spec, dataset)
    if validation_errors:
        raise _unprocessable(
            "La ChartSpec generada no es válida para el dataset: " + "; ".join(validation_errors)
        )

    explanation = data.get("explanation")
    return ChartGenerateResponse(
        chart_spec=spec.model_dump(mode="json"),
        explanation=explanation if isinstance(explanation, str) else None,
    )
