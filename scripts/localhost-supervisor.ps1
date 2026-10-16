param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nextCli = Join-Path $repoRoot "node_modules\next\dist\bin\next"
$runtimeDir = Join-Path $repoRoot ".localhost"
. (Join-Path $PSScriptRoot "localhost-process.ps1")
$mutex = New-Object System.Threading.Mutex($false, "Local\BracketballLocalhost3000")
$ownsMutex = $false
$server = $null

function Write-SupervisorLog([string]$Message) {
  $logPath = Join-Path $runtimeDir "supervisor.log"
  if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 2MB) {
    Move-Item -LiteralPath $logPath -Destination "$logPath.previous" -Force
  }
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $Message"
}

function Test-LocalPort {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $connection = $client.ConnectAsync("127.0.0.1", 3000)
    if (-not $connection.Wait(1000)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Stop-OwnedServer {
  if ($null -ne $server -and -not $server.HasExited) {
    # Next's CLI starts a worker; terminate only the process tree we launched.
    & "$env:SystemRoot\System32\taskkill.exe" /PID $server.Id /T /F | Out-Null
    $server.WaitForExit(10000) | Out-Null
  }
}

try {
  try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { exit 0 }
  if (-not (Test-Path -LiteralPath $NodePath) -or -not (Test-Path -LiteralPath $nextCli)) {
    throw "Node or Next is missing. Run npm install, then npm run localhost:install."
  }
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  Write-SupervisorLog "Monitor started (PID $PID). Workspace: $repoRoot"

  while ($true) {
    $server = Get-ManagedLocalhostProcess $repoRoot
    if ($null -eq $server -and (Test-LocalPort)) {
      Write-SupervisorLog "Port 3000 already has a server; leaving it running and waiting for the port."
      while (Test-LocalPort) { Start-Sleep -Seconds 10 }
    }

    try {
      if ($null -eq $server) {
        foreach ($name in @("next.out.log", "next.err.log")) {
          $logPath = Join-Path $runtimeDir $name
          if (Test-Path -LiteralPath $logPath) {
            Move-Item -LiteralPath $logPath -Destination "$logPath.previous" -Force
          }
        }
        $server = Start-Process -FilePath $NodePath `
          -ArgumentList @("`"$nextCli`"", "dev", "--hostname", "127.0.0.1", "--port", "3000") `
          -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $runtimeDir "next.out.log") `
          -RedirectStandardError (Join-Path $runtimeDir "next.err.log")
        @{ pid = $server.Id; startedAtUtcTicks = $server.StartTime.ToUniversalTime().Ticks } |
          ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir "server.json")
        Write-SupervisorLog "Started Next (PID $($server.Id)) at http://localhost:3000."
      } else {
        Write-SupervisorLog "Resuming monitoring of existing Next process (PID $($server.Id))."
      }
      # Retain the process handle so Windows preserves its exit code after a crash.
      $null = $server.Handle
      $startedAt = Get-Date
      $lastProbe = $startedAt
      $failures = 0

      while (-not $server.WaitForExit(5000)) {
        $now = Get-Date
        # Give initial compilation time; require three failures before restarting.
        if (($now - $startedAt).TotalSeconds -lt 180 -or ($now - $lastProbe).TotalSeconds -lt 30) { continue }
        $lastProbe = $now
        try {
          $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/cbb/player-projections" -TimeoutSec 20
          if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
          $failures = 0
        } catch {
          $failures++
          Write-SupervisorLog "Page check failed ($failures/3): $($_.Exception.Message)"
        }
        if ($failures -ge 3) {
          Write-SupervisorLog "Restarting unresponsive Next process tree (PID $($server.Id))."
          Stop-OwnedServer
          break
        }
      }
      Write-SupervisorLog "Next exited (PID $($server.Id), exit code $($server.ExitCode)); restarting in 5 seconds."
    } catch {
      Write-SupervisorLog "Server error: $($_.Exception.Message). Retrying in 5 seconds."
      Stop-OwnedServer
    } finally {
      if ($null -ne $server) { $server.Dispose(); $server = $null }
    }
    Start-Sleep -Seconds 5
  }
} finally {
  Stop-OwnedServer
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
