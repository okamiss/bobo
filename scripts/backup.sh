#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
backup="backups/bobo-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U bobo -d bobo -Fc > "$backup"
printf 'Backup saved: %s\n' "$backup"
