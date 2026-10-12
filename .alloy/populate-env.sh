#!/usr/bin/env bash
# Idempotently create .env with local-dev-safe values for MCIT LM.
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env
current=$(grep -E '^OPEN_NOTEBOOK_ENCRYPTION_KEY=' .env | cut -d= -f2- || true)
if [ -z "$current" ] || [ "$current" = "change-me-to-a-secret-string" ]; then
  key="${OPEN_NOTEBOOK_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
  grep -v '^OPEN_NOTEBOOK_ENCRYPTION_KEY=' .env > .env.tmp || true
  echo "OPEN_NOTEBOOK_ENCRYPTION_KEY=$key" >> .env.tmp
  mv .env.tmp .env
fi
grep -q '^IS_ALLOY=' .env || echo "IS_ALLOY=${IS_ALLOY:-false}" >> .env
mkdir -p surreal_data notebook_data ollama_data
