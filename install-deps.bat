@echo off
:: TL Voice Inbox - Windows Dependency Installer Launcher
:: Run this as Administrator

echo ================================================
echo TL Voice Inbox - Dependency Installer
echo ================================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Please run this script as Administrator!
    echo Right-click -^> "Run as administrator"
    pause
    exit /b 1
)

:: Check if PowerShell is available
where powershell >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: PowerShell not found!
    pause
    exit /b 1
)

:: Run the PowerShell installer
echo Starting installation...
echo This will install: Node.js 22, pnpm, whisper.cpp, llama.cpp
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0install-deps.ps1" %*

if %errorLevel% neq 0 (
    echo.
    echo Installation failed with error code %errorLevel%
    pause
    exit /b %errorLevel%
)

echo.
echo ================================================
echo Installation complete!
echo ================================================
pause
