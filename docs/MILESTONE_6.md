# Milestone 6: LLM Runtime + Extractor

This milestone implements the LLM runtime (`llama-server`) and the extraction pipeline for the TL Voice Inbox.

## Components

### 1. LLM Manager (`src/llm/manager.ts`)

Manages the `llama-server` subprocess:

- **Start/Stop/Restart**: Control the llama-server process
- **Health Monitoring**: Periodic health checks every 30 seconds
- **Model Management**: Download and verify GGUF models
- **Chat Completions**: HTTP client for `/v1/chat/completions`

**Environment Variables:**

```bash
LLAMA_SERVER_PATH=./llama-server  # Path to llama-server binary
LLM_MODELS_DIR=./data/models      # Directory for GGUF models
LLM_PORT=8080                     # llama-server port
LLM_CONTEXT_SIZE=8192             # Context window size
LLM_THREADS=4                     # Number of CPU threads
LLM_BATCH_SIZE=512                # Batch size
LLM_GPU_LAYERS=0                  # GPU layers (0 = CPU only)
LLM_DEBUG=true                    # Enable verbose logging
```

**CLI Commands:**

```bash
# Check model status
npm run llm:check

# Download default model (Qwen2.5-7B-Instruct-Q4_K_M)
npm run llm:download

# Download specific model
npm run llm:download https://huggingface.co/.../model.gguf my-model.gguf

# Ensure model exists (download if needed)
npm run llm:ensure
```

### 2. Extraction Schema (`src/llm/schema.ts`)

Zod validation schema for LLM output:

```typescript
{
  labels: string[];
  resolved_epic: { epic_id: string; confidence: number } | null;
  epic_mentions: { name: string; confidence: number }[];
  new_actions: Action[];
  new_deadlines: Deadline[];
  blockers: Blocker[];
  dependencies: Dependency[];
  issues: Issue[];
  knowledge_items: KnowledgeItem[];
  email_drafts: EmailDraft[];
  needs_review: boolean;
  evidence_snippets: string[];
}
```

### 3. Prompts (`src/llm/prompts.ts`)

Prompt engineering for structured extraction:

- System prompt with extraction rules
- JSON schema included in prompt
- Context building (epic snapshot + recent events + knowledge)
- Retry prompts for failed extractions

### 4. Extract Worker (`src/workers/extract/index.ts`)

Full extraction pipeline:

1. **Epic Candidate Scoring**: Reuses M5 logic (exact alias + FTS5)
2. **Ambiguity Detection**: Threshold-based needs_review flagging
3. **Context Building**: Epic snapshot + last 3 events + top 5 knowledge
4. **LLM Extraction**: Call to `/v1/chat/completions` with retry logic (max 3 attempts)
5. **Validation**: Zod schema validation
6. **Projection Persistence**: Idempotent writes to database

### 5. Reprocess Worker (`src/workers/reprocess/index.ts`)

Handles forced epic reprocessing:

- Triggered by `POST /api/events/:id/resolve`
- User-selected epic (or "no epic")
- Re-runs extraction with forced context
- Overwrites previous projections (idempotent by source_event_id)

## API Endpoints

### LLM Admin Endpoints

```
GET  /api/admin/llm/status      # LLM server health
POST /api/admin/llm/start       # Start llama-server
POST /api/admin/llm/stop        # Stop llama-server
POST /api/admin/llm/restart     # Restart with new config
GET  /api/admin/llm/models      # List available models
POST /api/admin/llm/models/download  # Download a model
DELETE /api/admin/llm/models/:name   # Delete a model
```

### Events Endpoints

```
POST /api/events/:id/resolve    # Resolve ambiguity and trigger reprocess
```

## Extraction Flow

```
1. STT completes → transcript available
2. Extract job starts
3. Epic candidate scoring (alias + FTS5)
4. If ambiguous → needs_review + candidates stored
5. If clear → build context + call LLM
6. LLM returns structured JSON
7. Validate against Zod schema
8. Retry up to 3 times on failure
9. Persist projections (idempotent)
10. Mark event as completed
```

## Reprocess Flow

```
1. User resolves event in UI
2. POST /api/events/:id/resolve
3. Enqueue reprocess job with epicId
4. Clear existing projections
5. Run extraction with forced epic context
6. Persist new projections
7. Mark event as completed
8. Clear candidates
```

## Configuration Example

```bash
# .env file
DATA_DIR=./data
DB_PATH=./data/tl-voice-inbox.db
WHISPER_MODELS_DIR=./data/models
LLM_MODELS_DIR=./data/models

# LLM Server
LLAMA_SERVER_PATH=./llama-server
LLM_PORT=8080
LLM_CONTEXT_SIZE=8192
LLM_THREADS=4
LLM_BATCH_SIZE=512
LLM_GPU_LAYERS=0

# Model (default: Qwen2.5-7B-Instruct-Q4_K_M ~4.4GB)
LLM_MODEL=qwen2.5-7b-instruct-q4_k_m.gguf
```

## Default Model

The system uses **Qwen2.5-7B-Instruct-Q4_K_M** by default:

- **Size**: ~4.4GB quantized
- **Context**: 8192 tokens
- **Language**: Multilingual (Spanish + English technical terms)
- **Quantization**: Q4_K_M (balanced quality/size)
- **Download**: First start or `npm run llm:ensure`

## Testing

Test the extraction pipeline:

```bash
# Start the server
cd apps/api
npm run dev

# Check LLM status
curl http://localhost:3000/api/admin/llm/status

# Start LLM manually (if not auto-started)
curl -X POST http://localhost:3000/api/admin/llm/start

# Upload audio (creates STT job)
curl -X POST -F "audio=@test.webm" http://localhost:3000/api/events

# Check extraction results
curl http://localhost:3000/api/events/:id
```

## Error Handling

- **LLM Not Available**: Extract jobs retry with exponential backoff
- **Invalid JSON**: Retry with stricter prompt (max 3 attempts)
- **Schema Validation Fail**: Log to event_runs, fail job
- **LLM Timeout**: 2 minute timeout on completions, retryable

## Idempotency

All projections are keyed by `source_event_id`:

- On reprocess: delete old projections, insert new ones
- Duplicate extractions are safe
- No orphaned records
