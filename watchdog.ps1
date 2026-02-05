# TL Voice Inbox - Watchdog & Auto-Deploy
# Monitors the API server and auto-restarts on crash or code changes

param(
    [switch]$DevMode,      # Watch for code changes and auto-rebuild
    [switch]$MonitorOnly,  # Don't start, just monitor existing process
    [int]$HealthCheckInterval = 10,  # Seconds between health checks
    [string]$WorkingDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
Set-Location $WorkingDir

# Configuration
$ApiPort = 3000
$HealthUrl = "http://localhost:$ApiPort/api/health"
$MaxRestartAttempts = 5
$RestartCooldown = 30  # Seconds between restart attempts

# State
$Script:ServerProcess = $null
$Script:RestartCount = 0
$Script:LastRestart = $null
$Script:FileWatcher = $null
$Script:Running = $true

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "SUCCESS" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
    
    # Also log to file
    "[$timestamp] [$Level] $Message" | Out-File -Append -FilePath "logs/watchdog.log" -ErrorAction SilentlyContinue
}

function Test-Health {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
        return $response.status -eq "ok"
    } catch {
        return $false
    }
}

function Get-QueueStatus {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$ApiPort/api/admin/queue" -Method GET -TimeoutSec 5
        return $response
    } catch {
        return $null
    }
}

function Start-Server {
    Write-Log "Starting API server..." "INFO"
    
    # Kill any existing node processes on port 3000
    $existing = Get-NetTCPConnection -LocalPort $ApiPort -ErrorAction SilentlyContinue | 
                Select-Object -ExpandProperty OwningProcess
    if ($existing) {
        Write-Log "Killing existing process on port $ApiPort (PID: $existing)" "WARN"
        Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Build first if needed
    if (-not $MonitorOnly) {
        Write-Log "Building API..." "INFO"
        $buildOutput = pnpm --filter api build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Build failed: $buildOutput" "ERROR"
            return $false
        }
    }
    
    # Start the server
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "pnpm"
    $startInfo.Arguments = "start"
    $startInfo.WorkingDirectory = $WorkingDir
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    
    $Script:ServerProcess = New-Object System.Diagnostics.Process
    $Script:ServerProcess.StartInfo = $startInfo
    
    # Capture output
    $Script:ServerProcess.OutputDataReceived += {
        if ($EventArgs.Data -match "error|fail|exception" -and $EventArgs.Data -notmatch "level.*30") {
            Write-Log "API OUT: $($EventArgs.Data)" "WARN"
        }
    }
    $Script:ServerProcess.ErrorDataReceived += {
        if ($EventArgs.Data) {
            Write-Log "API ERR: $($EventArgs.Data)" "ERROR"
        }
    }
    
    $started = $Script:ServerProcess.Start()
    $Script:ServerProcess.BeginOutputReadLine()
    $Script:ServerProcess.BeginErrorReadLine()
    
    if ($started) {
        Write-Log "Server started (PID: $($Script:ServerProcess.Id))" "SUCCESS"
        $Script:LastRestart = Get-Date
        return $true
    }
    return $false
}

function Stop-Server {
    if ($Script:ServerProcess -and -not $Script:ServerProcess.HasExited) {
        Write-Log "Stopping server (PID: $($Script:ServerProcess.Id))..." "INFO"
        $Script:ServerProcess.Kill()
        $Script:ServerProcess.WaitForExit(5000)
    }
}

function Restart-Server {
    $Script:RestartCount++
    Write-Log "Restart attempt $($Script:RestartCount)/$MaxRestartAttempts" "WARN"
    
    if ($Script:RestartCount -gt $MaxRestartAttempts) {
        $timeSinceLast = (Get-Date) - $Script:LastRestart
        if ($timeSinceLast.TotalSeconds -gt 60) {
            # Reset counter if last restart was a while ago
            $Script:RestartCount = 1
        } else {
            Write-Log "Too many restarts in short time. Giving up." "ERROR"
            $Script:Running = $false
            return
        }
    }
    
    Stop-Server
    Start-Sleep -Seconds 2
    Start-Server | Out-Null
    Start-Sleep -Seconds 5  # Wait for startup
}

function Start-FileWatcher {
    if (-not $DevMode) { return }
    
    Write-Log "Starting file watcher for auto-rebuild..." "INFO"
    
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = "$WorkingDir/apps/api/src"
    $watcher.Filter = "*.ts"
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents = $true
    
    $lastRebuild = Get-Date
    
    $action = {
        $timeSince = (Get-Date) - $lastRebuild
        if ($timeSince.TotalSeconds -lt 5) { return }  # Debounce
        
        $lastRebuild = Get-Date
        Write-Log "Code change detected, rebuilding..." "INFO"
        Restart-Server
    }
    
    Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action | Out-Null
    Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action | Out-Null
    
    $Script:FileWatcher = $watcher
}

function Show-Status {
    $queue = Get-QueueStatus
    if ($queue) {
        Write-Log "Queue: $($queue.pending) pending, $($queue.running) running, $($queue.failed) failed" "INFO"
    }
}

function Save-ErrorSnapshot {
    param([string]$Reason)
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $snapshotFile = "logs/error-snapshot-$timestamp.txt"
    
    $content = @"
═══════════════════════════════════════════════════════════
ERROR SNAPSHOT - $timestamp
Reason: $Reason
═══════════════════════════════════════════════════════════

SYSTEM INFO:
Time: $(Get-Date)
Hostname: $env:COMPUTERNAME
Node Version: $(node --version 2>$null || 'N/A')

RECENT WATCHDOG LOGS (last 30 lines):
$(Get-Content logs/watchdog.log -Tail 30 -ErrorAction SilentlyContinue | Out-String)

HEALTH STATUS:
$(try { Invoke-RestMethod "http://localhost:3000/api/health" -TimeoutSec 3 | ConvertTo-Json -Depth 3 } catch { "Health check failed: $_" })

QUEUE STATUS:
$(try { Invoke-RestMethod "http://localhost:3000/api/admin/queue" -TimeoutSec 3 | ConvertTo-Json -Depth 3 } catch { "Queue check failed: $_" })

RUNNING PROCESSES:
$(Get-Process -Name "node","whisper-cli","llama-server" -ErrorAction SilentlyContinue | Select-Object Name, Id | Format-Table -AutoSize | Out-String)

═══════════════════════════════════════════════════════════
SHARE THIS FILE WHEN ASKING FOR HELP
═══════════════════════════════════════════════════════════
"@
    
    $content | Out-File -FilePath $snapshotFile -Encoding UTF8
    Write-Log "Error snapshot saved to: $snapshotFile" "ERROR"
}

# Main
Write-Log "=== TL Voice Inbox Watchdog Started ===" "INFO"
Write-Log "Mode: $(if ($DevMode) { 'Development (auto-rebuild)' } else { 'Production' })" "INFO"
Write-Log "Health check every $HealthCheckInterval seconds" "INFO"

# Ensure logs directory
New-Item -ItemType Directory -Path "logs" -Force -ErrorAction SilentlyContinue | Out-Null

# Start server if not monitoring only
if (-not $MonitorOnly) {
    if (-not (Start-Server)) {
        Write-Log "Failed to start server" "ERROR"
        exit 1
    }
}

# Give server time to start
Start-Sleep -Seconds 5

# Start file watcher in dev mode
Start-FileWatcher

# Main monitoring loop
while ($Script:Running) {
    Start-Sleep -Seconds $HealthCheckInterval
    
    # Check if process is still running
    if ($Script:ServerProcess.HasExited) {
        Write-Log "Server process exited unexpectedly (code: $($Script:ServerProcess.ExitCode))" "ERROR"
        Save-ErrorSnapshot "Server process crashed"
        Restart-Server
        continue
    }
    
    # Check health endpoint
    if (-not (Test-Health)) {
        Write-Log "Health check failed" "WARN"
        Save-ErrorSnapshot "Health check failed"
        Restart-Server
        continue
    }
    
    # Show queue status periodically
    if ((Get-Date).Second -lt 10) {
        Show-Status
    }
    
    # Reset restart counter on successful health check
    if ($Script:RestartCount -gt 0) {
        $timeSinceLast = (Get-Date) - $Script:LastRestart
        if ($timeSinceLast.TotalMinutes -gt 5) {
            $Script:RestartCount = 0
            Write-Log "Stability restored, reset restart counter" "SUCCESS"
        }
    }
}

# Cleanup
Write-Log "Shutting down..." "INFO"
Stop-Server
if ($Script:FileWatcher) {
    $Script:FileWatcher.Dispose()
}
Write-Log "Watchdog stopped" "INFO"
