#!/bin/bash
# TL Voice Inbox - Linux/macOS Startup Script

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           TL Voice Inbox - Local Server                      ║"
echo "║           http://localhost:3000                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo

# Colors
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}[WARN]${NC} .env file not found. Using defaults."
    echo "         Copy .env.example to .env to customize."
    echo
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "[INFO] Installing dependencies..."
    pnpm install || {
        echo -e "${RED}[ERROR]${NC} Failed to install dependencies."
        exit 1
    }
    echo
fi

# Check if webapp is built
if [ ! -d apps/web/dist ]; then
    echo "[INFO] Building webapp for production..."
    pnpm build:web || {
        echo -e "${RED}[ERROR]${NC} Failed to build webapp."
        exit 1
    }
    echo
fi

# Check if database exists
if [ ! -f data/tl-voice-inbox.db ]; then
    echo "[INFO] Database not found. Running migrations..."
    mkdir -p data
    pnpm db:migrate || {
        echo -e "${RED}[ERROR]${NC} Failed to run migrations."
        exit 1
    }
    echo
fi

# Check for whisper model
if ! ls data/models/ggml-*.bin 1> /dev/null 2>&1; then
    echo -e "${YELLOW}[WARN]${NC} No whisper model found."
    echo "         Run: pnpm model:download tiny"
    echo
fi

echo -e "${GREEN}[INFO]${NC} Starting TL Voice Inbox..."
echo -e "${GREEN}[INFO]${NC} Server will be available at http://localhost:3000"
echo -e "${GREEN}[INFO]${NC} Press Ctrl+C to stop"
echo

# Start the server
pnpm start
