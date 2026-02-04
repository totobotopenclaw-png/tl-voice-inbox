# TL Voice Inbox - Local Deployment Guide

Deploy on your Windows miniPC for local voice capture and organization.

## Quick Start (Automated)

### Option 1: One-Click Installer (Recommended)

1. **Download the repository** as ZIP from GitHub
2. **Extract** to `C:\apps\tl-voice-inbox`
3. **Right-click** `install-deps.bat` → **"Run as administrator"**
4. Wait for installation (downloads Node.js, pnpm, whisper.cpp, llama.cpp)
5. **Restart** your terminal/PowerShell
6. **Configure** `.env` file (copy from `.env.example`)
7. **Run:** `pnpm setup && pnpm start`

### Option 2: Manual Installation

Follow the steps below if you prefer to install components manually.

---

## Prerequisites (Manual Install)

### 1. Install Node.js 22+
Download from https://nodejs.org/ and install.

Verify:
```powershell
node --version  # Should be v22.x.x
npm --version
```

### 2. Install pnpm
```powershell
npm install -g pnpm
pnpm --version  # Should be 9.x.x
```

### 3. Install Git (optional, for cloning)
Download from https://git-scm.com/download/win

### 4. Install whisper.cpp

Download pre-built Windows binary from:
https://github.com/ggerganov/whisper.cpp/releases

Or build from source with Visual Studio / MinGW.

Add `whisper-cli.exe` to your PATH or place in `C:\tools\whisper\`

### 5. Install llama.cpp (for M6+)

Download `llama-server.exe` from:
https://github.com/ggerganov/llama.cpp/releases

Add to PATH or place in `C:\tools\llama\`

## Deployment Steps

### 1. Get the Code

```powershell
# Clone or extract to your preferred location
cd C:\apps
git clone https://github.com/totobotopenclaw-png/tl-voice-inbox.git
# OR extract ZIP to C:\apps\tl-voice-inbox

cd tl-voice-inbox
```

### 2. Install Dependencies

```powershell
pnpm install
```

### 3. Configure Environment

Copy the example config:
```powershell
copy .env.example .env
notepad .env
```

Edit as needed (see Configuration section below).

### 4. Download Models

```powershell
# Download whisper model (tiny for CPU, base for better accuracy)
cd apps/api
pnpm model:download tiny
# OR
pnpm model:download base

# Download LLM model (for M6+)
pnpm llm:download https://huggingface.co/TheBloke/Llama-2-7B-GGUF/resolve/main/llama-2-7b.Q4_K_M.gguf
```

### 5. Setup Database

```powershell
# Run migrations
pnpm db:migrate

# Test database (optional)
pnpm test:db
```

### 6. Build for Production

```powershell
# Build webapp
pnpm build:web
```

### 7. Start the Server

#### Option A: Manual Start

```powershell
# Terminal 1: Start API (serves webapp static files)
pnpm start

# Or for development with hot reload
pnpm dev
```

#### Option B: Windows Service (Run on boot)

Use `nssm` (Non-Sucking Service Manager):

```powershell
# Download nssm from https://nssm.cc/
# Extract and add to PATH

# Create service
nssm install TLVoiceInbox
# Set Path: C:\apps\tl-voice-inbox\node_modules\.bin\pnpm.cmd
# Set Arguments: start
# Set Working Directory: C:\apps\tl-voice-inbox

nssm start TLVoiceInbox
```

## Configuration (.env)

```env
# Server
PORT=3000
HOST=0.0.0.0

# Data directory (will be created if doesn't exist)
DATA_DIR=./data

# Database
DB_PATH=./data/tl-voice-inbox.db

# Transcript retention (days)
TRANSCRIPT_TTL_DAYS=14

# Paths to binaries (if not in PATH)
WHISPER_CLI_PATH=C:\tools\whisper\whisper-cli.exe
LLAMA_SERVER_PATH=C:\tools\llama\llama-server.exe

# LLM Configuration (M6+)
LLM_MODEL=./data/models/llama-2-7b.Q4_K_M.gguf
LLM_PORT=8081
LLM_CONTEXT_SIZE=4096
LLM_THREADS=4

# Job queue
WORKER_CONCURRENCY=2
JOB_POLL_INTERVAL_MS=3000

# Web Push (M8+)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your@email.com
```

## Accessing the App

### From the miniPC itself:
Open browser to: `http://localhost:3000`

### From other devices on LAN:
1. Find your miniPC's IP address:
   ```powershell
   ipconfig
   # Look for "IPv4 Address" under your network adapter
   ```

2. Open browser on another device:
   `http://<miniPC-IP>:3000`

3. **Important**: Allow Windows Firewall:
   ```powershell
   # Run as Administrator
   New-NetFirewallRule -DisplayName "TL Voice Inbox" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```

## First Time Setup

1. **Create your first Epic:**
   - Go to "Epics" page
   - Click "New Epic"
   - Name it (e.g., "Project Alpha")
   - Add aliases (e.g., "alpha", "PA")

2. **Test Recording:**
   - Go to Dashboard
   - Click record button
   - Speak: "Update on Project Alpha: finished the API endpoint"
   - Stop recording
   - Wait for processing (check timeline)

3. **Check Results:**
   - View transcript in event detail
   - Check Inbox for extracted actions
   - Verify epic was matched

## Troubleshooting

### whisper.cpp not found
```powershell
# Check if in PATH
where whisper-cli

# If not found, set full path in .env
WHISPER_CLI_PATH=C:\full\path\to\whisper-cli.exe
```

### Database locked
SQLite doesn't support concurrent writes well. If you see "database is locked":
- Check only one instance is running
- Restart the server

### Port already in use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (replace <PID>)
taskkill /PID <PID> /F
```

### Build fails
```powershell
# Clean and reinstall
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

## Updating

```powershell
cd C:\apps\tl-voice-inbox

# Backup database
copy data\tl-voice-inbox.db data\tl-voice-inbox.db.backup

# Pull latest
git pull

# Reinstall dependencies (if package.json changed)
pnpm install

# Run migrations (if schema changed)
pnpm db:migrate

# Rebuild
pnpm build:web

# Restart server
```

## Backup Strategy

The database is a single file. Back it up regularly:

```powershell
# Manual backup
copy data\tl-voice-inbox.db D:\backups\tl-voice-inbox-%date:~-4,4%%date:~-10,2%%date:~-7,2%.db

# Or use Windows Task Scheduler to run nightly
```

## Performance Tuning (miniPC with 32GB RAM)

### For Intel i5-1250P:
- whisper.cpp: Use `tiny` or `base` model for real-time feel
- llama.cpp: Use Q4_K_M quantized models, 4 threads
- Database: Keep on SSD for fast queries

### Monitor resources:
```powershell
# Check CPU/RAM usage while processing
tasklist | findstr node
tasklist | findstr whisper
tasklist | findstr llama
```

## Security Notes

- All data stays local (no cloud)
- Bind to `0.0.0.0` exposes to LAN (required for mobile access)
- Consider Windows Firewall rules to restrict by subnet
- No authentication in MVP (add PIN in v1.1)

## Support

Check the GitHub repo for issues and updates:
https://github.com/totobotopenclaw-png/tl-voice-inbox
