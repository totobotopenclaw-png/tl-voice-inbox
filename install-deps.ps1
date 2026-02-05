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

# ============================================
# 1. Install Node.js 22
# ============================================
Write-Host "Installing Node.js 22..." -ForegroundColor Yellow

$nodePath="C:\Program Files\nodejs"

if(Test-Path "$nodePath\node.exe"){
    $env:Path="$nodePath;$env:Path"
    $ver=node --version
    Write-Host "Found: Node.js $ver" -ForegroundColor Green
}else{
    Write-Host "Downloading Node.js..." -ForegroundColor Gray
    $url="https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi"
    $out="$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    
    Write-Host "Installing Node.js (this may take a minute)..." -ForegroundColor Gray
    Start-Process msiexec.exe -ArgumentList "/i", $out, "/quiet", "/norestart" -Wait
    Remove-Item $out -ErrorAction SilentlyContinue
    
    $env:Path="$nodePath;$env:Path"
    $ver=node --version
    Write-Host "OK: Node.js $ver installed" -ForegroundColor Green
}

# ============================================
# 2. Install pnpm
# ============================================
Write-Host ""
Write-Host "Installing pnpm..." -ForegroundColor Yellow

$pnpmPaths=@(
    "$env:LOCALAPPDATA\pnpm\pnpm.exe",
    "$env:APPDATA\npm\pnpm.cmd",
    "$nodePath\pnpm.cmd"
)
$pnpmFound=$null
foreach($p in $pnpmPaths){
    if(Test-Path $p){
        $pnpmFound=$p
        $env:Path="$(Split-Path $p);$env:Path"
        break
    }
}

if($pnpmFound){
    $ver=pnpm --version
    Write-Host "Found: pnpm $ver" -ForegroundColor Green
}else{
    Write-Host "Installing pnpm..." -ForegroundColor Gray
    
    $npmCmd="$nodePath\npm.cmd"
    & $npmCmd install -g pnpm
    
    $pnpmDir="$env:LOCALAPPDATA\pnpm"
    if(Test-Path "$pnpmDir\pnpm.exe"){
        $env:Path="$pnpmDir;$env:Path"
        [Environment]::SetEnvironmentVariable("Path","$pnpmDir;$([Environment]::GetEnvironmentVariable("Path","User"))","User")
    }
    
    $ver=pnpm --version
    Write-Host "OK: pnpm $ver installed" -ForegroundColor Green
}

# ============================================
# 3. Install whisper.cpp
# ============================================
Write-Host ""
Write-Host "Installing whisper.cpp..." -ForegroundColor Yellow

$wDir="$InstallDir\whisper"
$wExe="$wDir\whisper-cli.exe"

if(Test-Path $wExe){
    Write-Host "Found: whisper.cpp at $wDir" -ForegroundColor Green
}else{
    Write-Host "Downloading whisper.cpp..." -ForegroundColor Gray
    
    New-Item -ItemType Directory -Path $wDir -Force | Out-Null
    
    # Use v1.7.4 which has Windows binaries
    $url="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-v1.7.4-bin-x64.zip"
    $zip="$env:TEMP\whisper.zip"
    
    try{
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -ErrorAction Stop
    }catch{
        # Fallback to v1.7.3 if v1.7.4 fails
        $url="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.3/whisper-v1.7.3-bin-x64.zip"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    }
    
    Expand-Archive -Path $zip -DestinationPath $wDir -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    
    $env:Path="$wDir;$env:Path"
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
Write-Host "Installing llama.cpp..." -ForegroundColor Yellow

$lDir="$InstallDir\llama"
$lExe="$lDir\llama-server.exe"

if(Test-Path $lExe){
    Write-Host "Found: llama.cpp at $lDir" -ForegroundColor Green
}else{
    Write-Host "Downloading llama.cpp..." -ForegroundColor Gray
    
    New-Item -ItemType Directory -Path $lDir -Force | Out-Null
    
    # Use a known working build
    $url="https://github.com/ggerganov/llama.cpp/releases/download/b4528/llama-b4528-bin-win-avx2-x64.zip"
    $zip="$env:TEMP\llama.zip"
    
    try{
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -ErrorAction Stop
    }catch{
        # Fallback to newer build
        $url="https://github.com/ggerganov/llama.cpp/releases/download/b4530/llama-b4530-bin-win-avx2-x64.zip"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    }
    
    Expand-Archive -Path $zip -DestinationPath $lDir -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    
    $env:Path="$lDir;$env:Path"
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
Write-Host "  1. Close and reopen PowerShell" -ForegroundColor White
Write-Host "  2. cd C:\apps\tl-voice-inbox" -ForegroundColor White
Write-Host "  3. copy .env.example .env" -ForegroundColor White
Write-Host "  4. notepad .env  (edit paths if needed)" -ForegroundColor White
Write-Host "  5. pnpm setup" -ForegroundColor White
Write-Host "  6. pnpm start" -ForegroundColor White
Write-Host ""
