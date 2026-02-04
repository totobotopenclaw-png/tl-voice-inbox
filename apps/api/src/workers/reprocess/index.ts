// Reprocess worker - handles manual epic resolution and re-extraction
// This worker re-runs extraction with a forced epic context

import type { Job, Worker, JobResult } from '../../queue/types.js';
import { db } from '../../db/connection.js';
import { getEpicSnapshot } from '../../services/epic-matcher.js';
import { complete, fail } from '../../queue/manager.js';

interface ReprocessJobPayload {
  epicId: string | null;
  transcript: string;
}

export class ReprocessWorker implements Worker {
  readonly type = 'reprocess' as const;

  async process(job: Job): Promise<JobResult> {
    console.log(`[ReprocessWorker] Processing job ${job.id} for event ${job.eventId}`);
    
    const payload = job.payload as ReprocessJobPayload | null;
    
    if (!payload?.transcript) {
      return {
        success: false,
        error: 'Missing transcript in job payload',
        retryable: false,
      };
    }

    const startTime = Date.now();
    
    try {
      // Get the event
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(job.eventId) as
        | { id: string; status: string; transcript: string | null }
        | undefined;
      
      if (!event) {
        return {
          success: false,
          error: 'Event not found',
          retryable: false,
        };
      }

      // Build context for LLM extraction
      let context: Record<string, unknown> = {
        transcript: payload.transcript,
        forcedEpicId: payload.epicId,
      };

      // If epic is specified, get snapshot for context
      if (payload.epicId) {
        const snapshot = getEpicSnapshot(payload.epicId);
        if (snapshot) {
          context = {
            ...context,
            epicSnapshot: snapshot,
          };
        }
      }

      // TODO: M6 - Call LLM with the context to re-extract
      // For now, we simulate the extraction process
      
      // Clear any existing projections for this event (idempotency)
      // This ensures reprocess doesn't duplicate data
      this.clearProjections(job.eventId);
      
      // Simulate extraction (M6 will add actual LLM call)
      // For now, we mark the event as completed with the forced epic
      
      // Update event status
      db.prepare(`
        UPDATE events 
        SET status = 'completed',
            status_reason = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(job.eventId);

      // Record in event_runs for observability
      const duration = Date.now() - startTime;
      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_runs (
          id, event_id, job_type, status, input_snapshot, output_snapshot, 
          duration_ms, created_at, updated_at
        )
        VALUES (?, ?, 'reprocess', 'success', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ 
          transcriptLength: payload.transcript.length,
          forcedEpicId: payload.epicId 
        }),
        JSON.stringify({ 
          note: 'Placeholder - full reprocessing in M6',
          epicAssigned: payload.epicId 
        }),
        duration
      );

      console.log(`[ReprocessWorker] Event ${job.eventId} reprocessed successfully (placeholder)`);

      return {
        success: true,
        data: {
          eventId: job.eventId,
          epicId: payload.epicId,
          note: 'Placeholder implementation - LLM reprocessing in M6',
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      
      // Record error
      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_runs (
          id, event_id, job_type, status, input_snapshot, output_snapshot, 
          error_message, duration_ms, created_at, updated_at
        )
        VALUES (?, ?, 'reprocess', 'error', ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ 
          transcriptLength: payload.transcript?.length || 0,
          forcedEpicId: payload?.epicId 
        }),
        null,
        err instanceof Error ? err.message : String(err),
        duration
      );
      
      return {
        success: false,
        error: `Failed to reprocess event: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }

  /**
   * Clear all projections for an event to ensure idempotency
   */
  private clearProjections(eventId: string): void {
    // Delete actions
    db.prepare('DELETE FROM actions WHERE source_event_id = ?').run(eventId);
    
    // Delete mentions (cascade from actions, but let's be explicit)
    // Mentions will be deleted by CASCADE
    
    // Delete knowledge items
    db.prepare('DELETE FROM knowledge_items WHERE source_event_id = ?').run(eventId);
    
    // Delete blockers
    db.prepare('DELETE FROM blockers WHERE source_event_id = ?').run(eventId);
    
    // Delete dependencies
    db.prepare('DELETE FROM dependencies WHERE source_event_id = ?').run(eventId);
    
    // Delete issues
    db.prepare('DELETE FROM issues WHERE source_event_id = ?').run(eventId);
    
    console.log(`[ReprocessWorker] Cleared projections for event ${eventId}`);
  }
}

export const reprocessWorker = new ReprocessWorker();
