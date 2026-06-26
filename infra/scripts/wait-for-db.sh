#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Espera a que PostgreSQL acepte conexiones antes de continuar.
# Pensado para el entrypoint del backend (antes de `alembic upgrade head`).
#
# Uso:  ./wait-for-db.sh && alembic upgrade head && uvicorn ...
# Variables:  POSTGRES_HOST (default postgres), POSTGRES_PORT (default 5432)
# ---------------------------------------------------------------------
set -euo pipefail

HOST="${POSTGRES_HOST:-postgres}"
PORT="${POSTGRES_PORT:-5432}"
RETRIES="${RETRIES:-30}"

echo "Esperando a PostgreSQL en ${HOST}:${PORT} ..."
for i in $(seq 1 "$RETRIES"); do
  if (echo > "/dev/tcp/${HOST}/${PORT}") >/dev/null 2>&1; then
    echo "PostgreSQL disponible."
    exit 0
  fi
  sleep 2
done

echo "ERROR: PostgreSQL no respondió tras ${RETRIES} intentos." >&2
exit 1
