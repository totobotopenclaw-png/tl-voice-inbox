# Workers

This directory contains background job workers for the TL Voice Inbox API.

## Worker Types

### STT Worker (`stt/`)
Transcribes audio files using whisper.cpp locally.

**Job Type:** `stt`
**Input:** `{ audioPath: string, language?: string }`
**Output:** Updates event with transcript, enqueues `extract` job

**Files:**
- `index.ts` - Worker implementation
- `whisper.ts` - whisper.cpp CLI wrapper
- `model-manager.ts` - Model download and management

### Extract Worker (`extract/`)
Extracts structured data from transcripts using LLM. (Placeholder for M6)

**Job Type:** `extract`
**Input:** `{ transcript: string }`
**Output:** Creates actions, knowledge items, etc.

### Reprocess Worker (M5)
Reprocesses events with corrected epic assignment.

**Job Type:** `reprocess`
**Input:** `{ epicId: string | null }`

### Push Worker (M8)
Sends Web Push notifications.

**Job Type:** `push`
**Input:** `{ subscriptionId: string, notificationType: string, ... }`

## Adding a New Worker

1. Create a new directory for your worker type
2. Implement the `Worker` interface:

```typescript
import type { Job, Worker, JobResult } from '../queue/types.js';

export class MyWorker implements Worker {
  readonly type = 'my_job_type' as const;

  async process(job: Job): Promise<JobResult> {
    // Process the job
    return { success: true, data: { ... } };
  }
}
```

3. Register the worker in `index.ts`:

```typescript
export { myWorker, MyWorker } from './my-worker/index.js';
```

4. Register with the worker runner in `src/index.ts`:

```typescript
import { myWorker } from './workers/index.js';
runner.register(myWorker);
```

## Worker Runner

The `WorkerRunner` class (`src/queue/runner.ts`) handles:
- Polling for pending jobs
- Claiming jobs atomically (SQLite row locking)
- Managing concurrent job execution
- Graceful shutdown with timeout

Configuration via environment variables:
- `WORKER_POLL_INTERVAL_MS` - How often to poll (default: 3000ms)
- `WORKER_MAX_CONCURRENT` - Max parallel jobs (default: 2)
