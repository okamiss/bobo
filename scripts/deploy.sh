#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:22.16.0-bookworm-slim node scripts/configure.mjs
fi
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
printf '%s\n' 'Bobo is ready. APP_ORIGIN and administrator credentials are in .env.'
