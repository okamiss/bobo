$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force -Path backups | Out-Null
$backupName = 'bobo-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
docker compose exec -T db pg_dump -U bobo -d bobo -Fc -f /tmp/bobo-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed' }
docker compose cp db:/tmp/bobo-backup.dump "backups/$backupName"
if ($LASTEXITCODE -ne 0) { throw 'Copying backup failed' }
Write-Host "Backup saved: backups/$backupName"
