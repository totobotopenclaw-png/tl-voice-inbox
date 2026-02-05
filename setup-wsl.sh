#!/bin/bash
# WSL Deployment Script for TL Voice Inbox
# Run this in WSL to set up everything

set -e

WORKSPACE="/home/alpogue/.openclaw/workspace"
PROJECT_DIR="$WORKSPACE/tl-voice-inbox"
DEPS_DIR="$WORKSPACE/.tl-deps"

echo "═══════════════════════════════════════════════════════════"
echo "     TL Voice Inbox - WSL Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Create directories
mkdir -p "$DEPS_DIR"
mkdir -p "$PROJECT_DIR/logs"

# Check/install dependencies
echo "[1/5] Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

# Install whisper.cpp
echo "[2/5] Setting up whisper.cpp..."
if [ ! -f "$DEPS_DIR/whisper.cpp/main" ]; then
    cd "$DEPS_DIR"
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git 2>/dev/null || true
    cd whisper.cpp
    make -j$(nproc) main
    ln -sf "$DEPS_DIR/whisper.cpp/main" "$DEPS_DIR/whisper-cli"
fi

# Install ffmpeg
echo "[3/5] Setting up ffmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y ffmpeg
fi

# Download models
echo "[4/5] Downloading models..."
mkdir -p "$PROJECT_DIR/data/models"
cd "$PROJECT_DIR"

if [ ! -f "data/models/ggml-tiny.bin" ]; then
    echo "Downloading whisper tiny model..."
    curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin" \
        -o "data/models/ggml-tiny.bin" --progress-bar
fi

# Install project deps
echo "[5/5] Installing project dependencies..."
cd "$PROJECT_DIR"
pnpm install 2>&1 | tail -5

# Setup database
if [ ! -f ".env" ]; then
    cp .env.example .env
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "     Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "To start the server, run:"
echo "  cd $PROJECT_DIR"
echo "  pnpm --filter api build"
echo "  WHISPER_CLI_PATH=$DEPS_DIR/whisper-cli pnpm start"
echo ""
