$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path -LiteralPath '.env')) {
    docker run --rm -v "${PWD}:/workspace" -w /workspace node:22.16.0-bookworm-slim node scripts/configure.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Configuration failed' }
}
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Docker Compose configuration' }
docker compose up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Inspect: docker compose logs --tail 100 init api web' }
Write-Host 'Bobo is ready. APP_ORIGIN and administrator credentials are in .env.'
