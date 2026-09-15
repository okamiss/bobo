#!/usr/bin/env bash
set -euo pipefail
backup="$(realpath "${1:?Pass a backup .dump file}")"
cd "$(dirname "$0")/.."
docker compose cp "$backup" db:/tmp/bobo-restore.dump
docker compose exec -T db createdb -U bobo bobo_restore
docker compose exec -T db pg_restore -U bobo -d bobo_restore --exit-on-error --no-owner /tmp/bobo-restore.dump
printf '%s\n' 'Restored to isolated database bobo_restore. Live database bobo was not modified.'
