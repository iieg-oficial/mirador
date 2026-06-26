#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Importa manifest.minerva.yml a una instancia de Minerva.
# Requiere un token de administrador de Minerva.
#
# Uso:
#   MINERVA_ADMIN_TOKEN=<token> ./infra/scripts/import-manifest.sh
#
# Variables:
#   MINERVA_URL          (default http://localhost:9000)
#   MINERVA_ADMIN_TOKEN  (obligatorio)
#   MANIFEST_PATH        (default manifest.minerva.yml en la raíz)
# ---------------------------------------------------------------------
set -euo pipefail

MINERVA_URL="${MINERVA_URL:-http://localhost:9000}"
MANIFEST_PATH="${MANIFEST_PATH:-$(dirname "$0")/../../manifest.minerva.yml}"

if [[ -z "${MINERVA_ADMIN_TOKEN:-}" ]]; then
  echo "ERROR: define MINERVA_ADMIN_TOKEN con un token de admin de Minerva." >&2
  exit 1
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "ERROR: no se encontró el manifiesto en $MANIFEST_PATH" >&2
  exit 1
fi

echo "Importando $MANIFEST_PATH a $MINERVA_URL ..."
curl -fsS -X POST "${MINERVA_URL}/api/v1/manifests/import" \
  -H "Authorization: Bearer ${MINERVA_ADMIN_TOKEN}" \
  -F "file=@${MANIFEST_PATH}"

echo
echo "Listo. Guarda el client_id / client_secret devueltos en tu .env (MINERVA_CLIENT_ID / MINERVA_CLIENT_SECRET)."
