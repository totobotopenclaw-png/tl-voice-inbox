# Milestone 6 Completion Report

## Summary

Successfully built Milestone 6 (LLM runtime + extractor) for TL Voice Inbox. This milestone adds local LLM processing using llama.cpp with structured JSON extraction for voice transcripts.

## Files Created/Modified

### New Files Created

1. **`src/llm/manager.ts`** - LLM server process management
   - Start/stop/restart llama-server subprocess
   - Health monitoring with periodic checks
   - Model download and management
   - Chat completions client

2. **`src/llm/schema.ts`** - Zod validation schemas
   - ExtractionOutputSchema for JSON validation
   - Type-safe validation function
   - Error formatting helpers

3. **`src/llm/prompts.ts`** - Prompt engineering
   - System prompt with extraction rules
   - Context building (epic snapshot + events + knowledge)
   - Retry prompts for failed extractions

4. **`src/llm/index.ts`** - Module exports

5. **`src/workers/extract/index.ts`** - Full extraction pipeline
   - Epic candidate scoring (reuses M5 logic)
   - Ambiguity detection with thresholds
   - Context building for LLM
   - Retry logic (max 3 attempts)
   - Idempotent projection persistence

6. **`src/workers/reprocess/index.ts`** - Reprocess worker
   - Handles forced epic reprocessing
   - Triggered by POST /api/events/:id/resolve
   - Overwrites previous projections

7. **`src/routes/admin-llm.ts`** - LLM admin API
   - GET /api/admin/llm/status
   - POST /api/admin/llm/start
   - POST /api/admin/llm/stop
   - POST /api/admin/llm/restart
   - GET /api/admin/llm/models
   - POST /api/admin/llm/models/download
   - DELETE /api/admin/llm/models/:name

8. **`scripts/llm-manager.ts`** - CLI script for model management
   - `npm run llm:download [url] [name]`
   - `npm run llm:check`
   - `npm run llm:ensure`

9. **`docs/MILESTONE_6.md`** - Documentation

### Files Modified

1. **`src/index.ts`**
   - Added llmManager import
   - Added llmAdminRoutes import
   - Registered llmAdminRoutes
   - Added LLM server initialization on startup
   - Added LLM server shutdown on graceful stop

2. **`src/routes/index.ts`**
   - Added llmAdminRoutes export

3. **`src/workers/index.ts`**
   - Added reprocessWorker export

4. **`src/db/repositories/search.ts`**
   - Added searchKnowledge() function for LLM context building

5. **`package.json`**
   - Added zod dependency
   - Added llm:* npm scripts

## LLM Integration Approach

### Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Extract Worker │────▶│ llama-server │────▶│  JSON Response  │
└─────────────────┘     └──────────────┘     └─────────────────┘
        │                                           │
        ▼                                           ▼
┌─────────────────┐                      ┌─────────────────┐
│  Context Build  │                      │  Zod Validation │
│  (Epic + FT5)   │                      │  (max 3 retries)│
└─────────────────┘                      └─────────────────┘
```

### Key Features

1. **Local-Only**: llama.cpp runs locally, no cloud dependencies
2. **Default Model**: Qwen2.5-7B-Instruct-Q4_K_M (~4.4GB)
3. **Multilingual**: Handles Spanish with English technical terms
4. **Structured Output**: JSON schema embedded in prompts
5. **Validation**: Zod schema validation with retries
6. **Idempotency**: All projections keyed by source_event_id

## Extraction End-to-End Flow

### Normal Flow

```
1. Event created (audio uploaded)
2. STT worker transcribes audio
3. Extract job queued with transcript
4. Extract worker runs:
   a. Score epic candidates (exact alias + FTS5)
   b. If ambiguous → needs_review + store candidates
   c. If clear → build context (epic snapshot + events + knowledge)
   d. Call llama-server /v1/chat/completions
   e. Parse and validate JSON response
   f. Retry up to 3 times on validation failure
   g. Persist projections (actions, deadlines, knowledge, etc.)
5. Mark event as completed
```

### Needs Review Flow

```
1. Extract worker detects ambiguity
2. Store top 3 epic candidates
3. Mark event as needs_review
4. Enqueue push notification (M8)
5. User resolves in UI via POST /api/events/:id/resolve
6. Enqueue reprocess job with selected epic
7. Reprocess worker clears old projections and re-runs extraction
8. Mark event as completed
```

## Example Extracted Data

```json
{
  "labels": ["EpicUpdate", "KnowledgeNote", "ActionItem"],
  "resolved_epic": {
    "epic_id": "550e8400-e29b-41d4-a716-446655440000",
    "confidence": 0.91
  },
  "epic_mentions": [{"name": "CP33", "confidence": 0.85}],
  "new_actions": [
    {
      "type": "follow_up",
      "title": "Comprobar resultado con OpenSea Destinations",
      "priority": "P1",
      "due_at": null,
      "mentions": ["Ana"],
      "body": "Verificar integración completada"
    }
  ],
  "new_deadlines": [
    {
      "title": "Enviar update antes de la 1",
      "priority": "P0",
      "due_at": "2026-02-05T13:00:00+01:00"
    }
  ],
  "blockers": [
    {"description": "Esperando web complete testing", "status": "open"}
  ],
  "dependencies": [],
  "issues": [
    {"description": "Se han levantado 2 issues en el booking flow", "status": "open"}
  ],
  "knowledge_items": [
    {
      "title": "Backend SuccessPage bookings",
      "kind": "tech",
      "tags": ["backend", "bookings"],
      "body_md": "El endpoint /api/v1/bookings retorna 201 con el booking_id..."
    }
  ],
  "email_drafts": [],
  "needs_review": false,
  "evidence_snippets": [
    "necesito verificar el resultado con Ana del equipo de OpenSea Destinations",
    "tenemos un blocker esperando que web complete los tests"
  ]
}
```

## Issues Encountered

### 1. Node.js Runtime Not Available
The test environment doesn't have Node.js available for running type checking. The code should be type-checked when deployed.

### 2. Dependencies
- Added `zod` to package.json for schema validation
- Requires llama.cpp compiled with llama-server binary

### 3. Model Download
- Default model (Qwen2.5-7B-Instruct-Q4_K_M) is ~4.4GB
- Downloaded automatically on first start if not present
- CLI script available for manual download

## Configuration

### Environment Variables

```bash
# LLM Server
LLAMA_SERVER_PATH=./llama-server  # Path to binary
LLM_MODELS_DIR=./data/models      # Models directory
LLM_PORT=8080                     # Server port
LLM_CONTEXT_SIZE=8192             # Context size
LLM_THREADS=4                     # CPU threads
LLM_BATCH_SIZE=512                # Batch size
LLM_GPU_LAYERS=0                  # GPU layers (0 = CPU)
LLM_DEBUG=true                    # Verbose logging
```

### API Endpoints

```
GET  /api/admin/llm/status
POST /api/admin/llm/start
POST /api/admin/llm/stop
POST /api/admin/llm/restart
```

## Next Steps

1. Install llama.cpp and ensure llama-server is available
2. Run `npm install` to install zod dependency
3. Start server - model will download automatically
4. Or pre-download: `npm run llm:ensure`

## Testing

```bash
# Check LLM status
curl http://localhost:3000/api/admin/llm/status

# Start LLM manually
curl -X POST http://localhost:3000/api/admin/llm/start

# Upload audio and trigger extraction
curl -X POST -F "audio=@test.webm" http://localhost:3000/api/events

# Check event status
curl http://localhost:3000/api/events/:id
```
