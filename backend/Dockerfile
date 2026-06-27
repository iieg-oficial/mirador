FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema mínimas. `git` es necesario para instalar el
# minerva-sdk desde su repo (git+https) cuando hay PAT.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

# Instala dependencias primero para aprovechar la caché de capas.
COPY pyproject.toml ./
# El minerva-sdk (dependencia base, repo privado) requiere un PAT, que llega como
# secreto de BuildKit (no queda en capas de la imagen). Es OBLIGATORIO: sin él el
# build falla — Minerva no es opcional. Asegúrate de exportar GITHUB_TOKEN al
# shell antes de construir (compose lo lee del entorno, no del .env):
#   set -a && . ./.env && set +a && docker compose -f infra/docker-compose.yml build
RUN --mount=type=secret,id=github_token \
    pip install --upgrade pip \
    && if [ ! -s /run/secrets/github_token ]; then \
         echo "ERROR: GITHUB_TOKEN vacío. El minerva-sdk es obligatorio y requiere un PAT." >&2; \
         exit 1; \
       fi \
    && GIT_CONFIG_COUNT=1 \
       GIT_CONFIG_KEY_0="url.https://x-access-token:$(cat /run/secrets/github_token)@github.com/.insteadOf" \
       GIT_CONFIG_VALUE_0="https://github.com/" \
       pip install -e ".[dev]"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
