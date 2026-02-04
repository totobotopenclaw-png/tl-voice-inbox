# TL Voice Inbox - Windows Dependency Installer
# Run as Administrator in PowerShell
param([string]$InstallDir="C:\tools")

$ErrorActionPreference="Stop"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TL Voice Inbox - Dependency Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create install directory
if(!(Test-Path $InstallDir)){
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Helper function
function Test-Cmd($cmd){
    try{Get-Command $cmd -ErrorAction Stop|Out-Null;return $true}
    catch{return $false}
}

# ============================================
# 1. Install Node.js 22
# ============================================
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVer=node --version 2>$null
if($nodeVer -and $nodeVer -match "^v22\."){
    Write-Host "OK: Node.js $nodeVer" -ForegroundColor Green
}else{
    Write-Host "Installing Node.js 22..." -ForegroundColor Yellow
    $url="https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi"
    $out="$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i", $out, "/quiet", "/norestart" -Wait
    Remove-Item $out -ErrorAction SilentlyContinue
    
    # Update PATH
    $machinePath=[Environment]::GetEnvironmentVariable("Path","Machine")
    $userPath=[Environment]::GetEnvironmentVariable("Path","User")
    $env:Path="$machinePath;$userPath"
    
    Write-Host "OK: Node.js installed" -ForegroundColor Green
}

# ============================================
# 2. Install pnpm
# ============================================
Write-Host ""
Write-Host "Checking pnpm..." -ForegroundColor Yellow
if(!(Test-Cmd "pnpm")){
    Write-Host "Installing pnpm..." -ForegroundColor Yellow
    iwr https://get.pnpm.io/install.ps1 -useb | iex
    
    # Update PATH
    $machinePath=[Environment]::GetEnvironmentVariable("Path","Machine")
    $userPath=[Environment]::GetEnvironmentVariable("Path","User")
    $env:Path="$machinePath;$userPath"
    
    Write-Host "OK: pnpm installed" -ForegroundColor Green
}else{
    Write-Host "OK: pnpm $(pnpm --version)" -ForegroundColor Green
}

# ============================================
# 3. Install whisper.cpp
# ============================================
Write-Host ""
Write-Host "Checking whisper.cpp..." -ForegroundColor Yellow
$wDir="$InstallDir\whisper"
$wExe="$wDir\whisper-cli.exe"
if(Test-Path $wExe){
    Write-Host "OK: whisper.cpp at $wDir" -ForegroundColor Green
}else{
    Write-Host "Installing whisper.cpp..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $wDir -Force | Out-Null
    $url="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-blas-bin-x64.zip"
    $zip="$env:TEMP\whisper.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $wDir -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    
    # Add to PATH
    $userPath=[Environment]::GetEnvironmentVariable("Path","User")
    if($userPath -notlike "*$wDir*"){
        [Environment]::SetEnvironmentVariable("Path","$userPath;$wDir","User")
    }
    Write-Host "OK: whisper.cpp installed" -ForegroundColor Green
}

# ============================================
# 4. Install llama.cpp
# ============================================
Write-Host ""
Write-Host "Checking llama.cpp..." -ForegroundColor Yellow
$lDir="$InstallDir\llama"
$lExe="$lDir\llama-server.exe"
if(Test-Path $lExe){
    Write-Host "OK: llama.cpp at $lDir" -ForegroundColor Green
}else{
    Write-Host "Installing llama.cpp..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $lDir -Force | Out-Null
    $url="https://github.com/ggerganov/llama.cpp/releases/download/b4528/llama-b4528-bin-win-avx2-x64.zip"
    $zip="$env:TEMP\llama.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $lDir -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    
    # Add to PATH
    $userPath=[Environment]::GetEnvironmentVariable("Path","User")
    if($userPath -notlike "*$lDir*"){
        [Environment]::SetEnvironmentVariable("Path","$userPath;$lDir","User")
    }
    Write-Host "OK: llama.cpp installed" -ForegroundColor Green
}

# ============================================
# Summary
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart PowerShell to refresh PATH" -ForegroundColor White
Write-Host "  2. cd C:\apps\tl-voice-inbox" -ForegroundColor White
Write-Host "  3. copy .env.example .env" -ForegroundColor White
Write-Host "  4. notepad .env  (edit paths if needed)" -ForegroundColor White
Write-Host "  5. pnpm setup" -ForegroundColor White
Write-Host "  6. pnpm start" -ForegroundColor White
Write-Host ""
