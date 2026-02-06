# TL Voice Inbox - Deployment Guide

## Quick Deploy to Vercel (Frontend Only)

The frontend can be deployed to Vercel, but the API requires the LLM server running locally.

### Step 1: Expose Your Local API (Temporary)

Install ngrok:
```bash
# Download from https://ngrok.com/download
# Or install via package manager
```

Start your API server:
```bash
cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/api
HOST=0.0.0.0 LLAMA_SERVER_PATH=~/.local/bin/llama-server WHISPER_CLI_PATH=~/.local/bin/whisper-cli pnpm start
```

In another terminal, expose it:
```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 2: Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Build the web app
cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/web
pnpm build

# Deploy (you'll be prompted to login)
vercel --prod
```

When prompted for environment variables, set:
```
VITE_API_URL=https://abc123.ngrok.io
```

### Alternative: GitHub + Vercel Integration

1. Push code to GitHub (already done)
2. Go to https://vercel.com/new
3. Import your GitHub repo
4. Set root directory to `apps/web`
5. Set build command: `pnpm build`
6. Set output directory: `dist`
7. Add environment variable: `VITE_API_URL=https://your-ngrok-url.ngrok.io`
8. Deploy

## Important Notes

⚠️ **LLM Server Required**: The API needs `llama-server` running locally. Without it, voice processing won't work.

⚠️ **Ngrok Free Limit**: Free ngrok URLs change every restart. For permanent access, you'd need:
- Paid ngrok plan (static domain)
- OR deploy API to VPS (expensive for LLM)
- OR use Cloudflare Tunnel (free, static)

## Cloudflare Tunnel (Recommended Free Option)

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create tl-voice-inbox

# Route to your API
cloudflared tunnel route dns tl-voice-inbox api.yourdomain.com

# Run tunnel
cloudflared tunnel run tl-voice-inbox
```

Then set `VITE_API_URL=https://api.yourdomain.com` in Vercel.

## Full Deployment (Without Local Server)

To deploy without keeping your laptop on, you'd need:

1. **VPS/Server** ($20-50/month)
   - Hetzner, DigitalOcean, AWS, etc.
   - 4GB+ RAM for LLM inference

2. **API Server on VPS**
   - Deploy the `apps/api` code
   - Run llama-server on the VPS
   - Uses CPU inference (slower than GPU)

3. **Database**
   - SQLite works but consider PostgreSQL for production

This is expensive for personal use. The ngrok/tunnel approach is best for testing.
