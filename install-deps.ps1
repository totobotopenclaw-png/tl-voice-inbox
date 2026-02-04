# TL Voice Inbox - Windows Dependency Installer
# Run as Administrator in PowerShell
# This script installs: Node.js 22, pnpm, whisper.cpp, llama.cpp

param(
    [string]$InstallDir = "C:\tools",
    [switch]$SkipNode = $false,
    [switch]$SkipWhisper = $false,
    [switch]$SkipLlama = $false
)

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $text -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Test-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

# Create install directory
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# ============================================
# 1. Install Node.js 22
# ============================================
if (!$SkipNode) {
    Write-Header "Installing Node.js 22"
    
    $nodeVersion = node --version 2>$null
    if ($nodeVersion -and $nodeVersion -match "^v22\.") {
        Write-Host "✓ Node.js $nodeVersion already installed" -ForegroundColor Green
    } else {
        Write-Host "Downloading Node.js 22..." -ForegroundColor Yellow
        
        $nodeUrl = "https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi"
        $nodeInstaller = "$env:TEMP\node-v22.13.1-x64.msi"
        
        try {
            Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
            Write-Host "Installing Node.js..." -ForegroundColor Yellow
            Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $nodeInstaller, "/quiet", "/norestart" -Wait
            Remove-Item $nodeInstaller -ErrorAction SilentlyContinue
            
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            $nodeVersion = node --version
            Write-Host "✓ Node.js $nodeVersion installed" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to install Node.js. Download manually from https://nodejs.org" -ForegroundColor Red
            exit 1
        }
    }
    
    # Install pnpm
    Write-Host "`nInstalling pnpm..." -ForegroundColor Yellow
    if (!(Test-Command "pnpm")) {
        try {
            Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            Write-Host "✓ pnpm installed" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to install pnpm" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✓ pnpm already installed: $(pnpm --version)" -ForegroundColor Green
    }
} else {
    Write-Host "Skipping Node.js/pnpm installation" -ForegroundColor Yellow
}

# ============================================
# 2. Install whisper.cpp
# ============================================
if (!$SkipWhisper) {
    Write-Header "Installing whisper.cpp"
    
    $whisperDir = "$InstallDir\whisper"
    $whisperExe = "$whisperDir\whisper-cli.exe"
    
    if (Test-Path $whisperExe) {
        Write-Host "✓ whisper.cpp already installed at $whisperDir" -ForegroundColor Green
    } else {
        Write-Host "Creating directory: $whisperDir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $whisperDir -Force | Out-Null
        
        Write-Host "Downloading whisper.cpp pre-built binary..." -ForegroundColor Yellow
        
        # Download from whisper.cpp releases
        $releaseUrl = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-blas-bin-x64.zip"
        $zipFile = "$env:TEMP\whisper-blas-bin-x64.zip"
        
        try {
            Invoke-WebRequest -Uri $releaseUrl -OutFile $zipFile -UseBasicParsing
            Write-Host "Extracting..." -ForegroundColor Yellow
            Expand-Archive -Path $zipFile -DestinationPath $whisperDir -Force
            Remove-Item $zipFile -ErrorAction SilentlyContinue
            
            Write-Host "✓ whisper.cpp installed to $whisperDir" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to download whisper.cpp" -ForegroundColor Red
            Write-Host "  Please download manually from: https://github.com/ggerganov/whisper.cpp/releases" -ForegroundColor Yellow
            exit 1
        }
    }
    
    # Add to PATH if not already there
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$whisperDir*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$currentPath;$whisperDir", "User")
        Write-Host "✓ Added whisper.cpp to PATH" -ForegroundColor Green
    }
} else {
    Write-Host "Skipping whisper.cpp installation" -ForegroundColor Yellow
}

# ============================================
# 3. Install llama.cpp
# ============================================
if (!$SkipLlama) {
    Write-Header "Installing llama.cpp"
    
    $llamaDir = "$InstallDir\llama"
    $llamaExe = "$llamaDir\llama-server.exe"
    
    if (Test-Path $llamaExe) {
        Write-Host "✓ llama.cpp already installed at $llamaDir" -ForegroundColor Green
    } else {
        Write-Host "Creating directory: $llamaDir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $llamaDir -Force | Out-Null
        
        Write-Host "Downloading llama.cpp pre-built binary..." -ForegroundColor Yellow
        
        # Download from llama.cpp releases
        $releaseUrl = "https://github.com/ggerganov/llama.cpp/releases/download/b4528/llama-b4528-bin-win-avx2-x64.zip"
        $zipFile = "$env:TEMP\llama-bin-win-avx2-x64.zip"
        
        try {
            Invoke-WebRequest -Uri $releaseUrl -OutFile $zipFile -UseBasicParsing
            Write-Host "Extracting..." -ForegroundColor Yellow
            Expand-Archive -Path $zipFile -DestinationPath $llamaDir -Force
            Remove-Item $zipFile -ErrorAction SilentlyContinue
            
            Write-Host "✓ llama.cpp installed to $llamaDir" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to download llama.cpp" -ForegroundColor Red
            Write-Host "  Please download manually from: https://github.com/ggerganov/llama.cpp/releases" -ForegroundColor Yellow
            exit 1
        }
    }
    
    # Add to PATH if not already there
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$llamaDir*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$currentPath;$llamaDir", "User")
        Write-Host "✓ Added llama.cpp to PATH" -ForegroundColor Green
    }
} else {
    Write-Host "Skipping llama.cpp installation" -ForegroundColor Yellow
}

# ============================================
# 4. Verify Installation
# ============================================
Write-Header "Verifying Installation"

$allGood = $true

# Check Node
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found in PATH" -ForegroundColor Red
    $allGood = $false
}

# Check pnpm
$pnpmVersion = pnpm --version 2>$null
if ($pnpmVersion) {
    Write-Host "✓ pnpm: $pnpmVersion" -ForegroundColor Green
} else {
    Write-Host "✗ pnpm not found in PATH" -ForegroundColor Red
    $allGood = $false
}

# Check whisper
$whisperPath = Get-Command whisper-cli -ErrorAction SilentlyContinue
if ($whisperPath) {
    Write-Host "✓ whisper-cli: $($whisperPath.Source)" -ForegroundColor Green
} else {
    Write-Host "✗ whisper-cli not found in PATH" -ForegroundColor Red
    $allGood = $false
}

# Check llama
$llamaPath = Get-Command llama-server -ErrorAction SilentlyContinue
if ($llamaPath) {
    Write-Host "✓ llama-server: $($llamaPath.Source)" -ForegroundColor Green
} else {
    Write-Host "✗ llama-server not found in PATH" -ForegroundColor Red
    $allGood = $false
}

# ============================================
# Summary
# ============================================
Write-Header "Installation Summary"

if ($allGood) {
    Write-Host "🎉 All dependencies installed successfully!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart your terminal/PowerShell to refresh PATH" -ForegroundColor White
    Write-Host "  2. Clone the repo: git clone https://github.com/totobotopenclaw-png/tl-voice-inbox.git" -ForegroundColor White
    Write-Host "  3. Run: cd tl-voice-inbox && pnpm setup && pnpm start" -ForegroundColor White
} else {
    Write-Host "⚠️ Some dependencies failed to install" -ForegroundColor Yellow
    Write-Host "`nPlease install missing components manually or restart and try again." -ForegroundColor Yellow
}

Write-Host "`nInstallation directory: $InstallDir" -ForegroundColor Gray
Write-Host "To reinstall specific components, use:" -ForegroundColor Gray
Write-Host "  .\install-deps.ps1 -SkipNode -SkipWhisper  # Install only llama.cpp" -ForegroundColor Gray
