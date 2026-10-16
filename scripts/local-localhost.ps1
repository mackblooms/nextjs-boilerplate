param(
  [ValidateSet("Install", "Start", "Stop", "Status", "Uninstall")]
  [string]$Action = "Status"
)

$ErrorActionPreference = "Stop"
$taskName = "Bracketball Localhost 3000"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runner = Join-Path $PSScriptRoot "localhost-supervisor.ps1"
. (Join-Path $PSScriptRoot "localhost-process.ps1")
$existingTask = $null
try {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
} catch {
  if ($_.CategoryInfo.Category -ne [System.Management.Automation.ErrorCategory]::ObjectNotFound) { throw }
}

if ($existingTask -and -not ($existingTask.Actions.Arguments -like "*`"$runner`"*")) {
  throw "Task '$taskName' belongs to another workspace. Inspect it in Task Scheduler before changing it."
}

switch ($Action) {
  "Install" {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules\next\dist\bin\next"))) {
      throw "Next is missing. Run npm install first."
    }
    $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $taskAction = New-ScheduledTaskAction -Execute (Join-Path $PSHOME "powershell.exe") `
      -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -NodePath `"$nodePath`"" `
      -WorkingDirectory $repoRoot
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $account
    # A repeating trigger recovers the monitor even if it exits without an error.
    $retry = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger @($logon, $retry) `
      -Settings $settings -Principal $principal `
      -Description "Keeps Bracketball rankings available on localhost:3000 while signed in. Logs: $repoRoot\.localhost" `
      -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output "Installed and started '$taskName'. Starts at sign-in and recovers automatically."
  }
  "Start" {
    if (-not $existingTask) { throw "Run npm run localhost:install first." }
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output "Localhost monitor enabled and started."
  }
  "Stop" {
    if ($existingTask) {
      Disable-ScheduledTask -TaskName $taskName | Out-Null
      Stop-ScheduledTask -TaskName $taskName
    }
    Stop-ManagedLocalhostProcess $repoRoot
    Write-Output "Localhost task disabled and stopped. Use npm run localhost:start to re-enable it."
  }
  "Uninstall" {
    if ($existingTask) {
      Disable-ScheduledTask -TaskName $taskName | Out-Null
      Stop-ScheduledTask -TaskName $taskName
      Stop-ManagedLocalhostProcess $repoRoot
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Write-Output "Localhost task removed. Project and ranking data retained."
  }
  "Status" {
    if ($existingTask) {
      $existingTask | Select-Object TaskName, State | Format-List
      Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime, LastTaskResult, NextRunTime | Format-List
    } else {
      Write-Output "Automatic startup is not installed. Run npm run localhost:install."
    }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/cbb/player-projections" -TimeoutSec 20
      Write-Output "Rankings page HTTP status: $($response.StatusCode)"
    } catch {
      Write-Output "Rankings page unavailable: $($_.Exception.Message)"
    }
    Write-Output "Logs: $repoRoot\.localhost"
  }
}
