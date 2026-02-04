// Placeholder Extract Worker - will be fully implemented in M6

import type { Job, Worker, JobResult, ExtractJobPayload } from '../../queue/types.js';
import { db } from '../../db/connection.js';

export class ExtractWorker implements Worker {
  readonly type = 'extract' as const;

  async process(job: Job): Promise<JobResult> {
    console.log(`[ExtractWorker] Processing job ${job.id} for event ${job.eventId}`);
    
    const payload = job.payload as ExtractJobPayload | null;
    
    if (!payload?.transcript) {
      return {
        success: false,
        error: 'Missing transcript in job payload',
        retryable: false,
      };
    }

    // TODO: M6 - Full LLM extraction implementation
    // For now, just mark as processed and log for observability

    try {
      // Update event status
      db.prepare(`
        UPDATE events 
        SET status = 'processed',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(job.eventId);

      // Record in event_runs
      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot, output_snapshot, duration_ms, created_at, updated_at)
        VALUES (?, ?, 'extract', 'success', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ transcriptLength: payload.transcript.length }),
        JSON.stringify({ note: 'Placeholder - full extraction in M6' }),
        0
      );

      console.log(`[ExtractWorker] Event ${job.eventId} marked as processed (placeholder)`);

      return {
        success: true,
        data: {
          note: 'Placeholder implementation - LLM extraction in M6',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update event: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }
}

export const extractWorker = new ExtractWorker();
