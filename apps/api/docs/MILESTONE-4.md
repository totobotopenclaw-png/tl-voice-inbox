# Milestone 4 — Job Queue + STT Worker

This milestone implements the job queue system with STT (Speech-to-Text) worker using whisper.cpp for local transcription.

## Overview

### Features Implemented

1. **Job Queue System** (`src/queue/`)
   - `enqueue()` - Add jobs to the queue
   - `claim()` - Atomically claim next pending job with SQLite row locking
   - `complete()` - Mark job as completed
   - `fail()` - Mark job as failed with retry logic
   - Worker runner with polling and concurrency control

2. **STT Worker** (`src/workers/stt/`)
   - whisper.cpp CLI integration for local transcription
   - Automatic model download (tiny/base models)
   - Spanish transcription with English technical terms support
   - Transcript storage with TTL
   - Automatic enqueue of `extract` job after transcription

3. **TTL Management** (`src/ttl/`)
   - Configurable transcript TTL (default 14 days)
   - Background cleanup of expired transcripts
   - Audio file cleanup
   - `POST /api/admin/purge-transcripts` endpoint

4. **Admin Endpoints**
   - Queue statistics
   - Model management (list, download, delete)
   - Transcript statistics
   - Worker control (start/stop)

## Architecture

### Job Queue Flow

```
1. POST /api/events (audio upload)
   ↓
2. Event created + Job enqueued (type: 'stt')
   ↓
3. WorkerRunner polls and claims job
   ↓
4. SttWorker.process()
   - Download model if needed
   - Run whisper.cpp
   - Save transcript
   - Update event status to 'transcribed'
   - Enqueue extract job
   ↓
5. ExtractWorker.process() (placeholder for M6)
```

### SQLite Row Locking

The queue uses `BEGIN IMMEDIATE` transactions to ensure only one worker can claim a job at a time:

```typescript
const transaction = db.transaction(() => {
  // 1. Find next pending job
  const row = db.prepare("SELECT * FROM jobs WHERE status = 'pending'...").get();
  
  // 2. Immediately UPDATE with running status
  const result = db.prepare("UPDATE jobs SET status = 'running'...").run(row.id);
  
  // 3. If changes === 0, another worker claimed it
  return result.changes > 0 ? row : null;
});
```

## Configuration

Environment variables:

```bash
# whisper.cpp
WHISPER_CLI_PATH=whisper-cli        # Path to whisper.cpp CLI binary
WHISPER_MODEL=tiny                  # Model size: tiny, base, small
WHISPER_MODELS_DIR=./data/models    # Where to store models
WHISPER_THREADS=4                   # Number of threads for transcription

# Transcript TTL
TRANSCRIPT_TTL_DAYS=14              # Default TTL for transcripts

# Worker Runner
WORKER_POLL_INTERVAL_MS=3000        # Polling interval
WORKER_MAX_CONCURRENT=2             # Max concurrent jobs

# Cleanup
CLEANUP_INTERVAL_HOURS=24           # How often to run cleanup
```

## API Endpoints

### Events
- `POST /api/events` - Upload audio and create event
- `GET /api/events` - List events
- `GET /api/events/:id` - Get event details

### Admin
- `GET /api/admin/queue` - Queue statistics
- `GET /api/admin/models` - List models
- `POST /api/admin/models/download` - Download model
- `DELETE /api/admin/models/:size` - Delete model
- `GET /api/admin/transcripts` - Transcript statistics
- `POST /api/admin/purge-transcripts` - Purge expired transcripts
- `POST /api/admin/workers/start` - Start worker runner
- `POST /api/admin/workers/stop` - Stop worker runner

## Running the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Installing whisper.cpp

### Option 1: Pre-built binaries
Download from https://github.com/ggerganov/whisper.cpp/releases

### Option 2: Build from source
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make
# Copy whisper-cli to your PATH
```

### Windows
```powershell
# Using CMake
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

## Model Management

Models are downloaded from HuggingFace (ggerganov/whisper.cpp) on first use:

- **tiny** (~75MB) - Fastest, good for CPU
- **base** (~148MB) - Balanced quality/speed
- **small** (~488MB) - Better quality, slower

For the MVP on CPU-only machines, `tiny` or `base` is recommended.

## Testing

```bash
# Run database tests
npm run test:db

# Check whisper.cpp availability
curl http://localhost:3000/api/admin/models
```

## Next Steps (Milestone 5-6)

- Implement `extract` worker with LLM integration (M6)
- Implement `reprocess` worker for needs_review resolution
- Add `push` worker for Web Push notifications (M8)
