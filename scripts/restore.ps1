param([Parameter(Mandatory=$true)][string]$Backup)
$ErrorActionPreference = 'Stop'
$backupPath = (Resolve-Path -LiteralPath $Backup).Path
Set-Location (Join-Path $PSScriptRoot '..')
docker compose cp "$backupPath" db:/tmp/bobo-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed' }
docker compose exec -T db createdb -U bobo bobo_restore
if ($LASTEXITCODE -ne 0) { throw 'Use a fresh bobo_restore database; existing database was not overwritten' }
docker compose exec -T db pg_restore -U bobo -d bobo_restore --exit-on-error --no-owner /tmp/bobo-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Restore failed' }
Write-Host 'Restored to isolated database bobo_restore. Live database bobo was not modified.'
