# WSL Deployment Guide

Run everything in WSL (Windows Subsystem for Linux) so the OpenClaw agent can manage it directly.

## Quick Setup

Open WSL terminal and run:

```bash
cd /mnt/c/apps/tl-voice-inbox  # or wherever you cloned it
bash setup-wsl.sh
```

This installs:
- Node.js 22
- pnpm
- whisper.cpp (compiled from source)
- ffmpeg
- Whisper model (tiny)

## Daily Usage

The agent can now run these commands directly:

```bash
# Start server
./tl-service.sh start

# Check status
./tl-service.sh status

# View logs
./tl-service.sh logs
./tl-service.sh logs 100  # last 100 lines

# Restart
./tl-service.sh restart

# Full diagnostic (useful for troubleshooting)
./tl-service.sh diagnose

# Update to latest code
./tl-service.sh update
```

## How It Works

1. **WSL has the shell** → I can run commands directly
2. **Everything lives in WSL** → No Windows path issues
3. **Logs are captured** → I can read them anytime
4. **Service script** → Simple commands for full control

## Windows Access

The API still listens on `0.0.0.0:3000`, so:
- **From Windows**: `http://localhost:3000` ✓
- **From LAN**: `http://<WSL-IP>:3000` ✓

Get WSL IP if needed:
```bash
ip addr show eth0 | grep "inet " | awk '{print $2}' | cut -d/ -f1
```

## File Locations

| Component | Location |
|-----------|----------|
| Project | `~/.openclaw/workspace/tl-voice-inbox` |
| Dependencies | `~/.openclaw/workspace/.tl-deps` |
| whisper.cpp | `~/.openclaw/workspace/.tl-deps/whisper.cpp` |
| Models | `data/models/` |
| Database | `data/tl-voice-inbox.db` |
| Logs | `logs/api.log` |

## Troubleshooting

### Permission denied
```bash
chmod +x tl-service.sh setup-wsl.sh
```

### Port already in use
```bash
./tl-service.sh stop
# Or manually:
lsof -ti:3000 | xargs kill -9
```

### Full reset
```bash
./tl-service.sh stop
rm -rf apps/api/dist
./tl-service.sh start
```

## Migration from Windows

If you were running on Windows before:

1. Stop Windows server
2. Copy database: `copy C:\apps\tl-voice-inbox\data\tl-voice-inbox.db /mnt/c/...`
3. Run setup in WSL
4. Move DB to WSL location

Or just start fresh - the setup is quick!
