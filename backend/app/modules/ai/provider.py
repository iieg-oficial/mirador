from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import SecretStr
from typing import Protocol, runtime_checkable

from app.core.config import get_settings


class AIProviderError(RuntimeError):
    """Fallo al obtener una respuesta del proveedor de IA.

    Cubre falta de API key, timeout o cualquier error del LLM. `service.py` lo
    traduce a un 503 con mensaje genérico (el detalle interno —que podría incluir
    datos sensibles— nunca se filtra al cliente).
    """


@runtime_checkable
class AIProvider(Protocol):
    """Contrato mínimo de un proveedor de IA: completar un prompt."""

    def complete(self, *, system_prompt: str, user_prompt: str) -> str:
        """Devuelve la respuesta del modelo como texto. Lanza `AIProviderError`."""
        ...


class LangChainOpenAIProvider:
    """Implementación de `AIProvider` sobre `langchain-openai` (ChatOpenAI).

    Cadena LCEL simple: ChatPromptTemplate | ChatOpenAI | StrOutputParser.
    """

    def __init__(self, *, api_key: str | None, model: str, timeout_seconds: int) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds

    def complete(self, *, system_prompt: str, user_prompt: str) -> str:
        if not self._api_key:
            raise AIProviderError("OPENAI_API_KEY no configurada.")

        try:
            llm = ChatOpenAI(
                model=self._model,
                api_key=SecretStr(self._api_key),
                timeout=self._timeout_seconds,
                max_retries=0,
            )
            prompt = ChatPromptTemplate.from_messages([("system", "{system}"), ("human", "{user}")])
            chain = prompt | llm | StrOutputParser()
            return chain.invoke({"system": system_prompt, "user": user_prompt})
        except Exception as exc:  # noqa: BLE001
            raise AIProviderError(str(exc)) from exc


def get_ai_provider() -> AIProvider:
    """Factory/dependency de FastAPI. En tests se sustituye con un fake vía
    `app.dependency_overrides[get_ai_provider]`."""
    settings = get_settings()
    return LangChainOpenAIProvider(
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_MODEL,
        timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
    )
