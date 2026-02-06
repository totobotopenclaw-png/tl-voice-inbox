# TL Voice Inbox - Fixes Summary

## Issues Fixed

### 1. Epic Auto-Creation Not Working
**Problem:** When recording audio mentioning new projects (like "CP39"), epics weren't being created automatically.

**Root Causes:**
- LLM prompt wasn't explicit enough about when to create `suggested_new_epic`
- LLM was returning `needs_review: true` instead of suggesting new epic
- No fallback mechanism when LLM failed to suggest epic

**Fixes Applied:**
- Updated prompt with explicit rules and examples for epic creation
- Added fallback extraction that scans action titles for CP/EP/Project codes
- Reordered logic to create epic even if `needs_review: true`

**Files Modified:**
- `apps/api/src/llm/prompts.ts` - Better epic assignment instructions
- `apps/api/src/workers/extract/index.ts` - Fallback extraction + debug logging

### 2. P3 Priority Validation Error
**Problem:** LLM returned P3 priority but schema only accepted P0-P2, causing extraction to fail.

**Fix:**
- Updated schema to accept P3 and normalize to P2

**File Modified:**
- `apps/api/src/llm/schema.ts`

### 3. Timeout on Long Transcripts
**Problem:** Long voice recordings timed out during LLM extraction.

**Fixes:**
- Increased base timeout to 5 minutes
- Added dynamic timeout scaling (20ms per character)
- Max timeout now 20 minutes
- Switched to AbortController for better timeout handling
- Added transcript truncation for very long inputs (>8000 chars)

**Files Modified:**
- `apps/api/src/llm/manager.ts`
- `apps/api/src/workers/extract/index.ts`

### 4. No Retry Option for Failed Events
**Problem:** When events failed (timeout, validation error, etc.), there was no way to retry.

**Fix:**
- Added `POST /api/events/:id/retry` endpoint
- Added retry button in EventDetail UI
- Retry clears old failed jobs and re-enqueues

**Files Modified:**
- `apps/api/src/routes/events.ts`
- `apps/web/src/hooks/useEvents.ts`
- `apps/web/src/components/EventDetail.tsx`

### 5. CORS Issues with LAN Access
**Problem:** Couldn't access web app from other devices on LAN.

**Fix:**
- Updated all frontend hooks to use relative URLs in dev mode
- Vite proxy forwards `/api` to backend
- Dynamic CORS origin mirroring in backend

**Files Modified:**
- `apps/web/src/hooks/useActions.ts`
- `apps/web/src/hooks/useEvents.ts`
- `apps/web/src/hooks/useKnowledge.ts`
- `apps/web/src/hooks/useRecording.ts`
- `apps/web/src/hooks/useSearch.ts`
- `apps/web/src/hooks/usePushSubscription.ts`
- `apps/web/src/pages/NeedsReview.tsx`
- `apps/web/src/pages/Epics.tsx`
- `apps/web/src/pages/Inbox.tsx`
- `apps/web/src/components/EventDetail.tsx`

## How to Test

### 1. Restart the API Server
```bash
cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/api
HOST=0.0.0.0 LLAMA_SERVER_PATH=~/.local/bin/llama-server WHISPER_CLI_PATH=~/.local/bin/whisper-cli pnpm start
```

### 2. Test Epic Auto-Creation
Record audio saying:
> "Necesito crear la épica CP39 para la política de cancelación. Es prioridad P1."

Expected:
- Epic "CP39 - Política de Cancelación" should be created
- Action should be linked to this epic

### 3. Test Manual API
```bash
# Create action
curl -X POST http://localhost:3000/api/actions \
  -H "Content-Type: application/json" \
  -d '{"sourceEventId":"test-event-id","type":"follow_up","title":"Test action","priority":"P2"}'

# Create knowledge
curl -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{"sourceEventId":"test-event-id","title":"Test knowledge","kind":"tech","bodyMd":"# Test"}'
```

### 4. Run Validation Script
```bash
bash /home/alpogue/.openclaw/workspace/tl-voice-inbox/test-validation.sh
```

## Still To Do / Known Issues

1. **Transcript Quality** - Spanish transcription accuracy depends on Whisper model quality. Consider upgrading to larger model if available.

2. **Audio Format Issues** - Some mobile recordings (especially iOS) create webm files that ffmpeg can't parse. This is a browser/device encoding issue.

3. **LLM Truncation** - Very long transcripts may still get truncated responses. The repair logic helps but isn't perfect.

## Files Changed Summary

Total commits: 15+
Files modified:
- Backend: 8 files (routes, workers, schema, prompts, LLM manager)
- Frontend: 10 files (hooks, components, pages)
- Tests: 1 new validation script

All changes pushed to master branch.
