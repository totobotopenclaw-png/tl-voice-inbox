// Extract Worker - Processes transcripts and extracts structured data
// Updated for M5: Integrates epic matching and needs_review flow

import type { Job, Worker, JobResult } from '../../queue/types.js';
import { db } from '../../db/connection.js';
import { 
  findEpicCandidates, 
  storeEpicCandidates 
} from '../../services/epic-matcher.js';
import { enqueue } from '../../queue/manager.js';

interface ExtractJobPayload {
  transcript: string;
}

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

    const startTime = Date.now();

    try {
      // Step 1: Find epic candidates using the epics-first retrieval algorithm
      const matchResult = findEpicCandidates(payload.transcript);
      
      console.log(`[ExtractWorker] Found ${matchResult.candidates.length} candidates, needsReview=${matchResult.needsReview}`);
      
      // Store candidates for potential review
      if (matchResult.candidates.length > 0) {
        storeEpicCandidates(job.eventId, matchResult.candidates);
      }

      // Step 2: Handle needs_review case
      if (matchResult.needsReview) {
        // Update event status to needs_review
        db.prepare(`
          UPDATE events 
          SET status = 'needs_review',
              status_reason = 'Ambiguous epic match',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(job.eventId);

        // Record in event_runs
        const duration = Date.now() - startTime;
        const runId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO event_runs (
            id, event_id, job_type, status, input_snapshot, output_snapshot, 
            duration_ms, created_at, updated_at
          )
          VALUES (?, ?, 'extract', 'success', ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          runId,
          job.eventId,
          JSON.stringify({ 
            transcriptLength: payload.transcript.length,
            phase: 'epic_matching' 
          }),
          JSON.stringify({ 
            candidates: matchResult.candidates,
            needsReview: true,
            topConfidence: matchResult.topConfidence,
            confidenceGap: matchResult.confidenceGap,
          }),
          duration
        );

        console.log(`[ExtractWorker] Event ${job.eventId} needs review - ambiguous epic match`);
        
        // TODO: M8 - Trigger push notification for needs_review

        return {
          success: true,
          data: {
            status: 'needs_review',
            candidates: matchResult.candidates,
          },
        };
      }

      // Step 3: Continue with full extraction if we have a clear match
      const topCandidate = matchResult.candidates[0];
      
      // Update event to processing
      db.prepare(`
        UPDATE events 
        SET status = 'processing',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(job.eventId);

      // TODO: M6 - Call LLM with the transcript and epic context
      // For now, mark as completed (placeholder)
      
      db.prepare(`
        UPDATE events 
        SET status = 'completed',
            status_reason = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(job.eventId);

      // Record success
      const duration = Date.now() - startTime;
      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_runs (
          id, event_id, job_type, status, input_snapshot, output_snapshot, 
          duration_ms, created_at, updated_at
        )
        VALUES (?, ?, 'extract', 'success', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ 
          transcriptLength: payload.transcript.length,
          phase: 'full_extraction',
          epicAssigned: topCandidate?.epicId || null,
        }),
        JSON.stringify({ 
          note: 'Placeholder - full LLM extraction in M6',
          epicAssigned: topCandidate?.epicId || null,
          confidence: topCandidate?.confidence || 0,
        }),
        duration
      );

      console.log(`[ExtractWorker] Event ${job.eventId} processed successfully (placeholder)`);

      return {
        success: true,
        data: {
          status: 'completed',
          epicAssigned: topCandidate?.epicId || null,
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
        VALUES (?, ?, 'extract', 'error', ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ 
          transcriptLength: payload.transcript?.length || 0,
          phase: 'extraction' 
        }),
        null,
        err instanceof Error ? err.message : String(err),
        duration
      );
      
      return {
        success: false,
        error: `Failed to extract: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }
}

export const extractWorker = new ExtractWorker();
