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
    
    # Try multiple URL patterns for Windows binaries
    # Newer releases moved to ggml-org and use different naming
    $urls=@(
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip",
        "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip",
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.3/whisper-bin-x64.zip",
        "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.3/whisper-bin-x64.zip"
    )
    
    $zip="$env:TEMP\whisper.zip"
    $downloaded=$false
    
    foreach($url in $urls){
        try{
            Write-Host "  Trying: $url" -ForegroundColor DarkGray
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -ErrorAction Stop -TimeoutSec 30
            $downloaded=$true
            Write-Host "  Downloaded from: $url" -ForegroundColor DarkGray
            break
        }catch{
            Write-Host "  Failed, trying next..." -ForegroundColor DarkGray
        }
    }
    
    if(-not $downloaded){
        Write-Host "ERROR: Could not download whisper.cpp binaries!" -ForegroundColor Red
        Write-Host "" -ForegroundColor Red
        Write-Host "Please manually install whisper.cpp:" -ForegroundColor Yellow
        Write-Host "  1. Download from: https://github.com/ggml-org/whisper.cpp/releases" -ForegroundColor White
        Write-Host "  2. Extract whisper-cli.exe to: $wDir" -ForegroundColor White
        Write-Host "  3. Add $wDir to your PATH" -ForegroundColor White
        Write-Host "" -ForegroundColor Yellow
        throw "whisper.cpp download failed"
    }
    
    Expand-Archive -Path $zip -DestinationPath $wDir -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    
    # Rename main.exe to whisper-cli.exe if needed (older builds use main.exe)
    if((Test-Path "$wDir\main.exe") -and -not (Test-Path $wExe)){
        Rename-Item -Path "$wDir\main.exe" -NewName "whisper-cli.exe" -Force
        Write-Host "  Renamed main.exe to whisper-cli.exe" -ForegroundColor DarkGray
    }
    
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
    
    # Try multiple URLs - repo moved to ggml-org and build numbers change
    $urls=@(
        "https://github.com/ggml-org/llama.cpp/releases/download/b4528/llama-b4528-bin-win-avx2-x64.zip",
        "https://github.com/ggerganov/llama.cpp/releases/download/b4528/llama-b4528-bin-win-avx2-x64.zip",
        "https://github.com/ggml-org/llama.cpp/releases/download/b4530/llama-b4530-bin-win-avx2-x64.zip"
    )
    
    $zip="$env:TEMP\llama.zip"
    $downloaded=$false
    
    foreach($url in $urls){
        try{
            Write-Host "  Trying: $url" -ForegroundColor DarkGray
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -ErrorAction Stop -TimeoutSec 30
            $downloaded=$true
            Write-Host "  Downloaded from: $url" -ForegroundColor DarkGray
            break
        }catch{
            Write-Host "  Failed, trying next..." -ForegroundColor DarkGray
        }
    }
    
    if(-not $downloaded){
        Write-Host "WARNING: Could not download llama.cpp binaries." -ForegroundColor Yellow
        Write-Host "You may need to manually install from: https://github.com/ggml-org/llama.cpp/releases" -ForegroundColor Yellow
    }else{
        Expand-Archive -Path $zip -DestinationPath $lDir -Force
        Remove-Item $zip -ErrorAction SilentlyContinue
        
        $env:Path="$lDir;$env:Path"
        $userPath=[Environment]::GetEnvironmentVariable("Path","User")
        if($userPath -notlike "*$lDir*"){
            [Environment]::SetEnvironmentVariable("Path","$userPath;$lDir","User")
        }
        
        Write-Host "OK: llama.cpp installed" -ForegroundColor Green
    }
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
