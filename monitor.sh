#!/bin/bash
# TL Voice Inbox - WSL Monitor Script
# Run this to check server status and auto-restart if needed

cd /home/alpogue/.openclaw/workspace/tl-voice-inbox

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════"
echo "     TL Voice Inbox - WSL Monitor"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if server is running
echo -n "Checking server health... "
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ RUNNING${NC}"
    curl -s http://localhost:3000/api/health | jq -r '. | "Status: \(.status)\nQueue: pending=\(.queue.pending), running=\(.queue.running), failed=\(.queue.failed)"' 2>/dev/null || echo "(health endpoint data unavailable)"
else
    echo -e "${RED}✗ DOWN${NC}"
    echo ""
    echo -e "${YELLOW}Restarting server...${NC}"
    
    # Kill any existing processes
    pkill -f "node.*tl-voice-inbox" 2>/dev/null || true
    sleep 2
    
    # Start server
    WHISPER_CLI_PATH=/home/alpogue/.local/bin/whisper-cli pnpm start > logs/api.log 2>&1 &
    sleep 5
    
    # Check again
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server restarted successfully!${NC}"
    else
        echo -e "${RED}✗ Failed to restart server${NC}"
        echo "Check logs: tail -50 /home/alpogue/.openclaw/workspace/tl-voice-inbox/logs/api.log"
        exit 1
    fi
fi

echo ""
echo "Recent log entries:"
tail -5 logs/api.log 2>/dev/null || echo "No log file"

echo ""
echo "═══════════════════════════════════════════════════════════"
