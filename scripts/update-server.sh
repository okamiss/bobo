#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  printf '%s\n' 'Missing .env. Configure the server before updating.' >&2
  exit 1
fi

# Stage 1: back up, fetch code (GitHub can be flaky from mainland servers),
# then re-run the freshly pulled copy of this script.
if [[ "${BOBO_UPDATE_PULLED:-}" != 1 ]]; then
  bash scripts/backup.sh
  for attempt in 1 2 3 4 5; do
    git pull --ff-only && break
    if ((attempt == 5)); then
      printf '%s\n' 'git pull failed 5 times. Nothing was deployed.' >&2
      exit 1
    fi
    printf 'git pull failed, retrying in 5 seconds (%s/5)...\n' "$attempt" >&2
    sleep 5
  done
  BOBO_UPDATE_PULLED=1 exec bash scripts/update-server.sh "$@"
fi

# Stage 2: keep the compose files chosen in .env (such as HTTPS) and add the
# registry override, so every file applies to pull and up alike.
separator="${COMPOSE_PATH_SEPARATOR:-:}"
files="${COMPOSE_FILE:-$(sed -n 's/^COMPOSE_FILE=//p' .env | tail -n 1 | tr -d $'\r"\'')}"
files="${files:-compose.yaml}"
case "$separator$files$separator" in
  *"${separator}compose.registry.yaml${separator}"*) ;;
  *) files="$files${separator}compose.registry.yaml" ;;
esac
export COMPOSE_FILE="$files"

# ACR Personal Edition build rules publish one fixed tag in the current UI.
# Wait for both ACR builds to finish before updating the server.
export IMAGE_TAG="${IMAGE_TAG:-latest}"

printf 'Compose files: %s\nImage tag: %s\n' "$COMPOSE_FILE" "$IMAGE_TAG"
docker compose config --quiet

for attempt in $(seq 1 20); do
  if output="$(docker compose pull init api web 2>&1)"; then
    printf '%s\n' "$output"
    break
  fi
  printf '%s\n' "$output" >&2
  if ! grep -qiE 'manifest unknown|not found|timeout|timed out|connection|TLS' <<<"$output" || ((attempt == 20)); then
    printf '%s\n' 'Image pull failed. Check "docker login" and the GitHub Actions run for this commit.' >&2
    exit 1
  fi
  printf 'Images for this commit are not published yet, waiting 30 seconds (%s/20)...\n' "$attempt"
  sleep 30
done

docker compose up -d \
  --no-build \
  --pull never \
  --wait \
  --wait-timeout 180

# Drop bobo images from older commits; images still used by containers are kept.
docker image ls --format '{{.Repository}}:{{.Tag}}' |
  grep -E '/bobo-(api|web):' |
  grep -v ":${IMAGE_TAG}\$" |
  xargs -r docker image rm >/dev/null 2>&1 || true

printf 'Bobo is running image tag %s from Alibaba Cloud ACR.\n' "$IMAGE_TAG"
