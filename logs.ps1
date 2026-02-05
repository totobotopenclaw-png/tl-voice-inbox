# Log Collector - Gathers logs for troubleshooting
# Run this and paste the output when asking for help

param(
    [int]$Lines = 50,
    [switch]$Full
)

$WorkingDir = $PSScriptRoot
Set-Location $WorkingDir

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "          TL Voice Inbox - Log Collector" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# System info
Write-Host "--- SYSTEM INFO ---" -ForegroundColor Yellow
Write-Host "Time: $(Get-Date)"
Write-Host "Hostname: $env:COMPUTERNAME"
Write-Host "Working Directory: $(Get-Location)"
Write-Host "Node Version: $(node --version 2>$null || 'NOT FOUND')"
Write-Host "pnpm Version: $(pnpm --version 2>$null || 'NOT FOUND')"
Write-Host "whisper-cli: $(if (Get-Command whisper-cli -ErrorAction SilentlyContinue) { 'FOUND' } else { 'NOT FOUND' })"
Write-Host "ffmpeg: $(if (Get-Command ffmpeg -ErrorAction SilentlyComplete) { 'FOUND' } else { 'NOT FOUND' })"
Write-Host ""

# Git status
Write-Host "--- GIT STATUS ---" -ForegroundColor Yellow
git log -1 --oneline 2>$null
git status --short 2>$null
Write-Host ""

# Recent commits
Write-Host "--- RECENT COMMITS ---" -ForegroundColor Yellow
git log --oneline -5 2>$null
Write-Host ""

# Process status
Write-Host "--- RUNNING PROCESSES ---" -ForegroundColor Yellow
Get-Process -Name "node","whisper-cli","llama-server" -ErrorAction SilentlyContinue | 
    Select-Object Name, Id, CPU, WorkingSet | 
    Format-Table -AutoSize
Write-Host ""

# Port check
Write-Host "--- PORT STATUS ---" -ForegroundColor Yellow
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyComplete
$port8081 = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyComplete
Write-Host "Port 3000 (API): $(if ($port3000) { "PID $($port3000.OwningProcess)" } else { 'NOT LISTENING' })"
Write-Host "Port 8081 (LLM): $(if ($port8081) { "PID $($port8081.OwningProcess)" } else { 'NOT LISTENING' })"
Write-Host ""

# Recent logs
Write-Host "--- RECENT API LOGS (last $Lines lines) ---" -ForegroundColor Yellow
$logFile = "logs/watchdog.log"
if (Test-Path $logFile) {
    Get-Content $logFile -Tail $Lines -ErrorAction SilentlyContinue
} else {
    Write-Host "No watchdog log found"
}
Write-Host ""

# Database status
Write-Host "--- DATABASE ---" -ForegroundColor Yellow
$dbPath = "data/tl-voice-inbox.db"
if (Test-Path $dbPath) {
    $dbSize = (Get-Item $dbPath).Length / 1MB
    Write-Host "Database exists: $dbPath ($([math]::Round($dbSize,2)) MB)"
} else {
    Write-Host "Database NOT FOUND at $dbPath"
}
Write-Host ""

# Health check
Write-Host "--- HEALTH CHECK ---" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "http://localhost:3000/api/health" -TimeoutSec 5 -ErrorAction Stop
    $health | ConvertTo-Json -Depth 3
} catch {
    Write-Host "ERROR: Cannot reach health endpoint - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Queue status
Write-Host "--- QUEUE STATUS ---" -ForegroundColor Yellow
try {
    $queue = Invoke-RestMethod "http://localhost:3000/api/admin/queue" -TimeoutSec 5 -ErrorAction Stop
    $queue | ConvertTo-Json -Depth 3
} catch {
    Write-Host "ERROR: Cannot get queue status - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

if ($Full) {
    # Recent events
    Write-Host "--- RECENT EVENTS ---" -ForegroundColor Yellow
    try {
        $events = Invoke-RestMethod "http://localhost:3000/api/events?limit=5" -TimeoutSec 5 -ErrorAction Stop
        $events.events | Select-Object id, status, createdAt | Format-Table -AutoSize
    } catch {
        Write-Host "ERROR: Cannot get events - $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""

    # Disk space
    Write-Host "--- DISK SPACE ---" -ForegroundColor Yellow
    Get-Volume -DriveLetter C | Select-Object DriveLetter, SizeRemaining, Size | 
        ForEach-Object { 
            $freeGB = [math]::Round($_.SizeRemaining / 1GB, 2)
            $totalGB = [math]::Round($_.Size / 1GB, 2)
            Write-Host "C: $freeGB GB free / $totalGB GB total"
        }
    Write-Host ""

    # Model files
    Write-Host "--- MODEL FILES ---" -ForegroundColor Yellow
    Get-ChildItem "data/models" -ErrorAction SilentlyContinue | 
        Select-Object Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB,2)}} | 
        Format-Table -AutoSize
}

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Copy the output above and paste it when asking for help" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
