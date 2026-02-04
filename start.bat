@echo off
chcp 65001 >nul
TITLE TL Voice Inbox Server
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║           TL Voice Inbox - Local Server                      ║
echo ║           http://localhost:3000                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Check if .env exists
if not exist .env (
    echo [WARN] .env file not found. Using defaults.
    echo         Copy .env.example to .env to customize.
    echo.
)

REM Check if node_modules exists
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call pnpm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

REM Check if webapp is built
if not exist apps\web\dist (
    echo [INFO] Building webapp for production...
    call pnpm build:web
    if errorlevel 1 (
        echo [ERROR] Failed to build webapp.
        pause
        exit /b 1
    )
    echo.
)

REM Check if database exists
if not exist data\tl-voice-inbox.db (
    echo [INFO] Database not found. Running migrations...
    call pnpm db:migrate
    if errorlevel 1 (
        echo [ERROR] Failed to run migrations.
        pause
        exit /b 1
    )
    echo.
)

REM Check for whisper model
if not exist data\models\ggml-*.bin (
    echo [WARN] No whisper model found.
    echo         Run: pnpm model:download tiny
    echo.
)

echo [INFO] Starting TL Voice Inbox...
echo [INFO] Server will be available at http://localhost:3000
echo [INFO] Press Ctrl+C to stop
echo.

REM Start the server
pnpm start

if errorlevel 1 (
    echo.
    echo [ERROR] Server stopped with error.
    pause
)
