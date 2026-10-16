function Get-ManagedLocalhostProcess([string]$RepoRoot) {
  $statePath = Join-Path $RepoRoot ".localhost\server.json"
  if (-not (Test-Path -LiteralPath $statePath)) { return $null }
  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $managed = Get-Process -Id $state.pid -ErrorAction Stop
    if ($managed.StartTime.ToUniversalTime().Ticks -ne $state.startedAtUtcTicks) { return $null }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($managed.Id)"
    $expectedCli = '"' + (Join-Path $RepoRoot "node_modules\next\dist\bin\next") + '"'
    if (-not $details.CommandLine.Contains($expectedCli)) { return $null }
    return $managed
  } catch {
    return $null
  }
}

function Stop-ManagedLocalhostProcess([string]$RepoRoot) {
  $managed = Get-ManagedLocalhostProcess $RepoRoot
  if ($null -ne $managed) {
    & "$env:SystemRoot\System32\taskkill.exe" /PID $managed.Id /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not $managed.HasExited) {
      throw "Could not stop the managed Next process tree (PID $($managed.Id))."
    }
    $managed.WaitForExit(10000) | Out-Null
  }
}
