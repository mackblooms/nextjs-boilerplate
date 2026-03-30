param(
  [string]$BackupZip
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupRoot = Join-Path $repoRoot "backups"

function Write-Info {
  param([string]$Message)
  Write-Host "[restore-check] $Message"
}

if (-not $BackupZip) {
  $latest = Get-ChildItem -Path $backupRoot -Filter "backup-*.zip" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw "No backup zip found in $backupRoot."
  }

  $BackupZip = $latest.FullName
}

if (-not (Test-Path $BackupZip)) {
  throw "Backup zip not found: $BackupZip"
}

Write-Info "Using backup zip: $BackupZip"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("restore-check-" + [guid]::NewGuid().ToString("N"))
$extractDir = Join-Path $tempRoot "extract"
$cloneDir = Join-Path $tempRoot "clone"

New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

try {
  Expand-Archive -Path $BackupZip -DestinationPath $extractDir -Force

  $bundle = Join-Path $extractDir "repo.bundle"
  if (-not (Test-Path $bundle)) {
    throw "repo.bundle is missing from backup."
  }

  git bundle verify $bundle | Out-Null
  Write-Info "Bundle verification passed."

  git clone $bundle $cloneDir | Out-Null
  if (-not (Test-Path (Join-Path $cloneDir ".git"))) {
    throw "Clone from bundle failed."
  }
  Write-Info "Bundle clone test passed."

  $dbDump = Join-Path $extractDir "database.dump"
  $hasPgRestore = $null -ne (Get-Command "pg_restore" -ErrorAction SilentlyContinue)
  if ((Test-Path $dbDump) -and $hasPgRestore) {
    & pg_restore --list $dbDump | Out-Null
    Write-Info "Database dump validation passed."
  } elseif (Test-Path $dbDump) {
    Write-Warning "database.dump exists, but pg_restore is not installed. Skipping DB validation."
  } else {
    Write-Info "No database.dump in backup. Skipping DB validation."
  }

  Write-Info "Restore check complete."
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
