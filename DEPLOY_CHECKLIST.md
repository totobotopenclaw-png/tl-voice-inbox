# TL Voice Inbox - Deployment Checklist

**Status as of Feb 6, 2026**

## ✅ READY TO DEPLOY

### Current State
- ✅ API running locally on http://localhost:3000
- ✅ Tunnel active: https://tlvoice1770399355.loca.lt (expires on restart)
- ✅ Frontend built and ready
- ⚠️ Vercel deployment pending

### Files Changed Today
- 16+ commits to master
- All fixes applied (epic auto-creation, P3 priority, timeouts, retry button, manual forms)
- Build passes TypeScript checks

## 🚀 QUICK DEPLOY (2 minutes)

### Option 1: Vercel (Recommended)
1. Go to https://vercel.com/signup
2. Sign up with GitHub
3. Click "Add New Project"
4. Import `totobotopenclaw-png/tl-voice-inbox`
5. Settings:
   - Root Directory: `apps/web`
   - Framework Preset: Vite
   - Build Command: `pnpm build`
   - Output Directory: `dist`
   - Environment Variable: `VITE_API_URL=https://tlvoice1770399355.loca.lt`
6. Click Deploy

### Option 2: Netlify
1. Go to https://app.netlify.com
2. "Add new site" → "Import an existing project"
3. Connect GitHub → Select `tl-voice-inbox`
4. Build settings:
   - Base directory: `apps/web`
   - Build command: `pnpm build`
   - Publish directory: `dist`
5. Environment variables: `VITE_API_URL=https://tlvoice1770399355.loca.lt`
6. Deploy

## ⚠️ IMPORTANT NOTES

**Local Server Required:**
- Your laptop must stay ON with API running
- API command: `cd apps/api && HOST=0.0.0.0 LLAMA_SERVER_PATH=~/.local/bin/llama-server WHISPER_CLI_PATH=~/.local/bin/whisper-cli pnpm start`

**Tunnel URL:**
- Current: https://tlvoice1770399355.loca.lt
- Changes on restart - update Vercel env var if needed
- For permanent URL: use paid ngrok or Cloudflare Tunnel

**Known Issues:**
- 1 event extraction fails with `body: null` validation error
- Spanish transcription accuracy ~80% (technical terms often wrong)
- Audio from iOS sometimes fails (webm encoding issues)

## 📱 HOW TO USE ONCE DEPLOYED

1. Open the Vercel URL on your phone
2. Record voice message mentioning epics (e.g., "CP39 política cancelación")
3. System will auto-create epic if LLM suggests it
4. Check Inbox for actions
5. Check Knowledge for notes

## 🔧 IF TUNNEL BREAKS

Restart tunnel:
```bash
nohup npx localtunnel --port 3000 --subdomain tlvoice$(date +%s) > /tmp/lt.log 2>&1 &
sleep 5 && cat /tmp/lt.log | grep "your url is"
```

Then update `VITE_API_URL` in Vercel dashboard → Settings → Environment Variables → Redeploy

---

**Next Steps:**
- [ ] Complete Vercel deployment
- [ ] Test from mobile device
- [ ] Monitor for extraction errors
