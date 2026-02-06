#!/bin/bash
# TL Voice Inbox - Deploy Script
# This starts your local API and exposes it via ngrok for Vercel to connect

echo "🚀 TL Voice Inbox Deployment Helper"
echo "===================================="
echo ""

# Check if API is running
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ API is running on http://localhost:3000"
else
    echo "⚠️  API is not running. Starting it..."
    echo ""
    echo "Run this in another terminal first:"
    echo "  cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/api"
    echo "  HOST=0.0.0.0 LLAMA_SERVER_PATH=~/.local/bin/llama-server WHISPER_CLI_PATH=~/.local/bin/whisper-cli pnpm start"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo ""
echo "🌐 Starting ngrok tunnel..."
echo "This will expose your local API to the internet."
echo "Press Ctrl+C to stop."
echo ""

# Run ngrok
/tmp/ngrok http 3000
