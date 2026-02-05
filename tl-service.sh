#!/bin/bash
# WSL Service Manager - Managed by OpenClaw Agent
# Handles start/stop/restart/logs for the API server

set -e

WORKSPACE="/home/alpogue/.openclaw/workspace"
PROJECT_DIR="$WORKSPACE/tl-voice-inbox"
DEPS_DIR="$WORKSPACE/.tl-deps"
PID_FILE="$PROJECT_DIR/.server.pid"
LOG_FILE="$PROJECT_DIR/logs/api.log"
PID_WATCHDOG="$PROJECT_DIR/.watchdog.pid"

export WHISPER_CLI_PATH="${WHISPER_CLI_PATH:-$DEPS_DIR/whisper-cli}"
export PATH="$DEPS_DIR:$PATH"

cd "$PROJECT_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

start() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log "Server already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi
    
    log "Starting API server..."
    
    # Build if needed
    if [ ! -d "apps/api/dist" ] || [ "$(find apps/api/src -newer apps/api/dist -type f 2>/dev/null | wc -l)" -gt 0 ]; then
        log "Building..."
        pnpm --filter api build >> "$LOG_FILE" 2>&1
    fi
    
    # Start server in background
    nohup pnpm start >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    
    log "Server started (PID: $(cat "$PID_FILE"))"
    
    # Wait for startup
    sleep 5
    
    if health_check; then
        log "Server is healthy"
        return 0
    else
        log "WARNING: Server may not be fully started yet"
        return 1
    fi
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log "Stopping server (PID: $PID)..."
            kill "$PID" 2>/dev/null || true
            sleep 2
            # Force kill if still running
            if kill -0 "$PID" 2>/dev/null; then
                kill -9 "$PID" 2>/dev/null || true
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # Also kill any stray node processes on port 3000
    if command -v lsof >/dev/null; then
        PID=$(lsof -t -i:3000 2>/dev/null || true)
        if [ -n "$PID" ]; then
            kill "$PID" 2>/dev/null || true
        fi
    fi
    
    log "Server stopped"
}

restart() {
    stop
    sleep 2
    start
}

status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Server: RUNNING (PID: $PID)"
            health_check && echo "Health: OK" || echo "Health: FAILED"
        else
            echo "Server: STOPPED (stale PID file)"
            rm -f "$PID_FILE"
        fi
    else
        echo "Server: STOPPED"
    fi
    
    # Queue status
    echo ""
    echo "Queue Status:"
    curl -s "http://localhost:3000/api/admin/queue" 2>/dev/null | jq -r '. | "  Pending: \(.pending), Running: \(.running), Failed: \(.failed)"' 2>/dev/null || echo "  (API not reachable)"
}

health_check() {
    curl -sf "http://localhost:3000/api/health" >/dev/null 2>&1
}

logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -n "${1:-50}" "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

watch() {
    # Auto-restart loop
    log "Starting watchdog..."
    
    while true; do
        if ! health_check; then
            log "Health check failed, restarting..."
            restart
        fi
        
        # Check for code changes
        if [ "$(find apps/api/src -newer apps/api/dist -type f 2>/dev/null | wc -l)" -gt 0 ]; then
            log "Code changes detected, rebuilding..."
            restart
        fi
        
        sleep 10
    done
}

diagnose() {
    echo "═══════════════════════════════════════════════════════════"
    echo "DIAGNOSTIC REPORT"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Time: $(date)"
    echo "Working Dir: $PROJECT_DIR"
    echo ""
    
    echo "--- PROCESS STATUS ---"
    ps aux | grep -E "(node|whisper)" | grep -v grep || echo "No relevant processes"
    echo ""
    
    echo "--- PORT STATUS ---"
    ss -tlnp 2>/dev/null | grep :3000 || netstat -tlnp 2>/dev/null | grep :3000 || echo "Port 3000: not listening"
    echo ""
    
    echo "--- HEALTH CHECK ---"
    curl -s "http://localhost:3000/api/health" 2>/dev/null | jq . 2>/dev/null || echo "Health check failed"
    echo ""
    
    echo "--- QUEUE STATUS ---"
    curl -s "http://localhost:3000/api/admin/queue" 2>/dev/null | jq . 2>/dev/null || echo "Queue check failed"
    echo ""
    
    echo "--- RECENT LOGS (last 30 lines) ---"
    logs 30
    echo ""
    
    echo "--- DEPENDENCIES ---"
    echo "Node: $(node --version 2>/dev/null || echo 'NOT FOUND')"
    echo "pnpm: $(pnpm --version 2>/dev/null || echo 'NOT FOUND')"
    echo "whisper-cli: $WHISPER_CLI_PATH $(test -f "$WHISPER_CLI_PATH" && echo "(EXISTS)" || echo "(NOT FOUND)")"
    echo "ffmpeg: $(which ffmpeg 2>/dev/null || echo 'NOT FOUND')"
}

update() {
    log "Updating from git..."
    
    # Backup DB
    if [ -f "data/tl-voice-inbox.db" ]; then
        cp "data/tl-voice-inbox.db" "data/tl-voice-inbox-$(date +%Y%m%d-%H%M%S).db.backup"
    fi
    
    git pull
    pnpm install
    pnpm --filter api db:migrate
    pnpm --filter api build
    
    log "Update complete, restarting..."
    restart
}

case "${1:-status}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs "${2:-50}"
        ;;
    watch)
        watch
        ;;
    diagnose)
        diagnose
        ;;
    update)
        update
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|watch|diagnose|update}"
        echo ""
        echo "Commands:"
        echo "  start     - Start the server"
        echo "  stop      - Stop the server"
        echo "  restart   - Restart the server"
        echo "  status    - Show server status"
        echo "  logs [n]  - Show last n log lines (default 50)"
        echo "  watch     - Start watchdog (auto-restart on failure)"
        echo "  diagnose  - Full diagnostic report"
        echo "  update    - Pull latest code and restart"
        exit 1
        ;;
esac
