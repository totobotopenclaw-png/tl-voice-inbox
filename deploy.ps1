# TL Voice Inbox - Deploy Script
# One command to deploy and monitor the entire system

param(
    [switch]$FirstRun,      # Install dependencies on first run
    [switch]$Dev,           # Development mode with auto-rebuild
    [switch]$Update,        # Pull latest and redeploy
    [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"
$WorkingDir = $PSScriptRoot
Set-Location $WorkingDir

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "SUCCESS" { "Green" }
        "STEP" { "Cyan" }
        default { "White" }
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-Command {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Test-Port {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

Write-Log "=== TL Voice Inbox Deploy ===" "STEP"

# Check prerequisites
Write-Log "Checking prerequisites..." "STEP"

$checks = @{
    "node" = "Node.js"
    "pnpm" = "pnpm"
    "git" = "Git"
    "whisper-cli" = "whisper.cpp"
    "ffmpeg" = "ffmpeg"
}

$missing = @()
foreach ($cmd in $checks.Keys) {
    if (Test-Command $cmd) {
        Write-Log "✓ $($checks[$cmd]) found" "SUCCESS"
    } else {
        Write-Log "✗ $($checks[$cmd]) NOT found" "ERROR"
        $missing += $checks[$cmd]
    }
}

if ($missing.Count -gt 0) {
    Write-Log "" "ERROR"
    Write-Log "Missing dependencies: $($missing -join ', ')" "ERROR"
    Write-Log "" "ERROR"
    Write-Log "Please install missing dependencies:" "WARN"
    
    if ($missing -contains "Node.js") {
        Write-Log "  - Node.js: https://nodejs.org/" "INFO"
    }
    if ($missing -contains "pnpm") {
        Write-Log "  - pnpm: npm install -g pnpm" "INFO"
    }
    if ($missing -contains "Git") {
        Write-Log "  - Git: https://git-scm.com/download/win" "INFO"
    }
    if ($missing -contains "whisper.cpp") {
        Write-Log "  - Run: .\install-deps.ps1" "INFO"
    }
    if ($missing -contains "ffmpeg") {
        Write-Log "  - ffmpeg: winget install Gyan.FFmpeg" "INFO"
    }
    
    exit 1
}

# First run setup
if ($FirstRun) {
    Write-Log "First run setup..." "STEP"
    
    if (-not (Test-Path ".env")) {
        Write-Log "Creating .env from example..." "INFO"
        Copy-Item ".env.example" ".env"
        Write-Log "✓ Created .env - edit it if needed" "SUCCESS"
    }
    
    Write-Log "Installing dependencies..." "INFO"
    pnpm install
    
    Write-Log "Downloading models..." "INFO"
    pnpm --filter api model:download tiny
    
    Write-Log "Setting up database..." "INFO"
    pnpm --filter api db:migrate
}

# Update mode
if ($Update) {
    Write-Log "Updating from git..." "STEP"
    
    # Backup database
    if (Test-Path "data/tl-voice-inbox.db") {
        $backupName = "data/tl-voice-inbox-$(Get-Date -Format 'yyyyMMdd-HHmmss').db.backup"
        Copy-Item "data/tl-voice-inbox.db" $backupName
        Write-Log "✓ Database backed up to $backupName" "SUCCESS"
    }
    
    git fetch origin
    git checkout $Branch
    git pull origin $Branch
    
    Write-Log "Reinstalling dependencies..." "INFO"
    pnpm install
    
    Write-Log "Running migrations..." "INFO"
    pnpm --filter api db:migrate
}

# Build
Write-Log "Building application..." "STEP"
pnpm --filter api build

if ($LASTEXITCODE -ne 0) {
    Write-Log "Build failed!" "ERROR"
    exit 1
}

Write-Log "✓ Build successful" "SUCCESS"

# Check if port is in use
if (Test-Port 3000) {
    Write-Log "Port 3000 is already in use" "WARN"
    $killExisting = Read-Host "Kill existing process? (y/n)"
    if ($killExisting -eq 'y') {
        $process = Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess
        Stop-Process -Id $process -Force
        Write-Log "✓ Killed process on port 3000" "SUCCESS"
        Start-Sleep -Seconds 2
    }
}

# Start with watchdog
Write-Log "Starting server with watchdog..." "STEP"
Write-Log "Press Ctrl+C to stop" "WARN"
Write-Log ""

if ($Dev) {
    .\watchdog.ps1 -DevMode -HealthCheckInterval 10
} else {
    .\watchdog.ps1 -HealthCheckInterval 10
}
