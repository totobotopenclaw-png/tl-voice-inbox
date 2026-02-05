#!/bin/bash
# Alternative WSL Setup using Python/faster-whisper instead of whisper.cpp
# Easier installation, no compilation needed

set -e

WORKSPACE="/home/alpogue/.openclaw/workspace"
PROJECT_DIR="$WORKSPACE/tl-voice-inbox"
DEPS_DIR="$WORKSPACE/.tl-deps"

echo "═══════════════════════════════════════════════════════════"
echo "     TL Voice Inbox - WSL Setup (Python Edition)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Setup Node
echo "[1/4] Setting up Node.js..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || (nvm install 22 && nvm use 22)

# Check pip
echo "[2/4] Setting up Python environment..."
if ! python3 -c "import pip" 2>/dev/null; then
    echo "pip not available, trying to install..."
    curl https://bootstrap.pypa.io/get-pip.py | python3
fi

# Install faster-whisper
echo "[3/4] Installing faster-whisper..."
python3 -m pip install --user faster-whisper 2>&1 | tail -3

# Create wrapper script
echo "[4/4] Creating whisper-cli wrapper..."
mkdir -p "$DEPS_DIR"
cat > "$DEPS_DIR/whisper-cli" << 'EOF'
#!/usr/bin/env python3
"""whisper-cli wrapper using faster-whisper"""
import argparse
import sys
import os
from faster_whisper import WhisperModel

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-f', '--file', required=True, help='Audio file')
    parser.add_argument('-m', '--model', default='tiny', help='Model name')
    parser.add_argument('-l', '--language', default='es', help='Language')
    parser.add_argument('-t', '--threads', type=int, default=4, help='Threads')
    parser.add_argument('-otxt', action='store_true', help='Output text file')
    parser.add_argument('-of', '--output', help='Output file prefix')
    parser.add_argument('--no-timestamps', action='store_true', help='No timestamps')
    args = parser.parse_args()
    
    model_size = args.model.replace('.bin', '').replace('ggml-', '')
    model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=args.threads)
    
    segments, info = model.transcribe(args.file, language=args.language, beam_size=5)
    
    text = " ".join([segment.text for segment in segments])
    
    if args.otxt and args.output:
        with open(f"{args.output}.txt", 'w') as f:
            f.write(text)
    else:
        print(text)

if __name__ == "__main__":
    main()
EOF
chmod +x "$DEPS_DIR/whisper-cli"

# Download model
echo "Downloading tiny model..."
python3 -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8')" 2>&1 | grep -v "^Downloading" || true

# Install project deps
echo "Installing project dependencies..."
cd "$PROJECT_DIR"
pnpm install 2>&1 | tail -5

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "     Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "whisper-cli: $DEPS_DIR/whisper-cli"
echo ""
echo "To start:"
echo "  export WHISPER_CLI_PATH=$DEPS_DIR/whisper-cli"
echo "  ./tl-service.sh start"
echo ""
