param(
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupRoot = Join-Path $repoRoot "backups"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$workDir = Join-Path $backupRoot $timestamp

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

function Write-Info {
  param([string]$Message)
  Write-Host "[backup] $Message"
}

Write-Info "Repo root: $repoRoot"
Write-Info "Backup dir: $workDir"

Push-Location $repoRoot
try {
  $bundlePath = Join-Path $workDir "repo.bundle"
  git bundle create $bundlePath --all
  Write-Info "Saved git bundle."

  $statusPath = Join-Path $workDir "git-status.txt"
  git status --short --branch | Out-File -FilePath $statusPath -Encoding utf8
  Write-Info "Saved git status."

  $diffPath = Join-Path $workDir "working-tree.patch"
  git diff --binary HEAD | Out-File -FilePath $diffPath -Encoding utf8
  Write-Info "Saved working tree patch."

  $trackedArchivePath = Join-Path $workDir "tracked-files.zip"
  git archive --format=zip -o $trackedArchivePath HEAD
  Write-Info "Saved tracked files archive."
}
finally {
  Pop-Location
}

$dbUrl = $env:SUPABASE_DB_URL
if (-not $dbUrl) {
  $dbUrl = $env:POSTGRES_URL
}

$hasPgDump = $null -ne (Get-Command "pg_dump" -ErrorAction SilentlyContinue)
if ($dbUrl -and $hasPgDump) {
  $dbDumpPath = Join-Path $workDir "database.dump"
  & pg_dump --dbname=$dbUrl --format=custom --file=$dbDumpPath --no-owner --no-privileges
  Write-Info "Saved database dump."
} elseif ($dbUrl -and -not $hasPgDump) {
  Write-Warning "Database URL found, but pg_dump is not installed. Skipping DB backup."
} else {
  Write-Info "No SUPABASE_DB_URL or POSTGRES_URL found. Skipping DB backup."
}

$metadata = [ordered]@{
  created_at = (Get-Date).ToString("o")
  repo_root = $repoRoot
  backup_dir = $workDir
  retention_days = $RetentionDays
  includes_database_dump = (Test-Path (Join-Path $workDir "database.dump"))
}
$metadataPath = Join-Path $workDir "metadata.json"
$metadata | ConvertTo-Json | Out-File -FilePath $metadataPath -Encoding utf8

$zipPath = Join-Path $backupRoot ("backup-" + $timestamp + ".zip")
Compress-Archive -Path (Join-Path $workDir "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force
Write-Info "Compressed backup: $zipPath"

$offsitePath = $env:BACKUP_OFFSITE_PATH
if ($offsitePath) {
  New-Item -ItemType Directory -Force -Path $offsitePath | Out-Null
  Copy-Item -Path $zipPath -Destination (Join-Path $offsitePath (Split-Path $zipPath -Leaf)) -Force
  Write-Info "Copied backup to offsite path: $offsitePath"
} else {
  Write-Info "No BACKUP_OFFSITE_PATH set. Skipping offsite copy."
}

$cutoff = (Get-Date).AddDays(-1 * [Math]::Abs($RetentionDays))
Get-ChildItem -Path $backupRoot -Filter "backup-*.zip" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Info "Removed old backup zip: $($_.Name)"
  }

Get-ChildItem -Path $backupRoot -Directory |
  Where-Object { $_.Name -match "^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$" -and $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    Write-Info "Removed old unpacked backup dir: $($_.Name)"
  }

Write-Info "Backup complete."
