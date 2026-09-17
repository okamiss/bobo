#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Installs (or updates) a daily database backup in the current user's crontab.
# Schedule uses the server time zone; override with BACKUP_SCHEDULE="m h * * *".
schedule="${BACKUP_SCHEDULE:-30 3 * * *}"
marker="# bobo daily backup"
project="$(printf '%q' "$PWD")"
line="$schedule cd $project && PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash scripts/backup.sh >> backups/cron.log 2>&1 $marker"

if ! command -v crontab >/dev/null; then
  printf '%s\n' 'crontab not found. Install cron first: apt-get install -y cron' >&2
  exit 1
fi

mkdir -p backups
{
  crontab -l 2>/dev/null | grep -vF "$marker" || true
  printf '%s\n' "$line"
} | crontab -

printf 'Daily backup installed:\n%s\n' "$line"
printf 'Log: %s/backups/cron.log\n' "$PWD"
