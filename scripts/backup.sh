#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
keep="${BACKUP_KEEP:-14}"
name="bobo-$(date +%Y%m%d-%H%M%S).dump"
backup="backups/$name"

# Dump to a temporary file so a failed run never looks like a valid backup.
trap 'rm -f "$backup.partial"' EXIT
docker compose exec -T db pg_dump -U bobo -d bobo -Fc > "$backup.partial"
mv "$backup.partial" "$backup"
printf 'Backup saved: %s\n' "$backup"

# Keep only the newest $keep local backups.
ls -1t backups/bobo-*.dump 2>/dev/null |
  tail -n +"$((keep + 1))" |
  xargs -r rm -f -- || true

# Copy offsite to the private OSS bucket when the site stores media there.
# A failed upload keeps the local backup and does not stop updates.
if ! docker compose exec -T api node dist/backup-upload.js "$name" < "$backup"; then
  printf 'Warning: offsite copy to OSS failed; the local backup is kept.\n' >&2
fi
