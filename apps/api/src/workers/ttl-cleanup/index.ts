// TTL Cleanup Job - Runs periodically to purge expired transcripts

import type { Job, JobResult } from '../../queue/types.js';
import { db } from '../../db/connection.js';
import { purgeExpiredTranscripts, cleanupAudioFiles } from '../../ttl/manager.js';
import { enqueue } from '../../queue/manager.js';

export interface TtlCleanupPayload {
  dryRun?: boolean;
}

export class TtlCleanupWorker {
  readonly type = 'ttl_cleanup' as const;

  async process(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    console.log(`[TtlCleanupWorker] Processing job ${job.id}`);

    const payload = job.payload as TtlCleanupPayload | null;
    const dryRun = payload?.dryRun ?? false;

    try {
      // Step 1: Get stats before cleanup
      const beforeStats = this.getTranscriptStats();
      console.log(`[TtlCleanupWorker] Before cleanup: ${beforeStats.totalWithTranscripts} transcripts, ${beforeStats.expired} expired`);

      if (dryRun) {
        console.log('[TtlCleanupWorker] Dry run mode - no changes made');
        return {
          success: true,
          data: {
            dryRun: true,
            stats: beforeStats,
          },
        };
      }

      // Step 2: Purge expired transcripts
      const { count: transcriptsCleared, eventIds } = purgeExpiredTranscripts();
      console.log(`[TtlCleanupWorker] Cleared ${transcriptsCleared} expired transcripts`);

      // Step 3: Clean up audio files for purged events
      const { deleted: audioFilesDeleted, errors: audioErrors } = cleanupAudioFiles(eventIds);
      
      if (audioErrors.length > 0) {
        console.error('[TtlCleanupWorker] Audio cleanup errors:', audioErrors);
      }

      // Step 4: Get stats after cleanup
      const afterStats = this.getTranscriptStats();

      const duration = Date.now() - startTime;

      // Step 5: Record the cleanup run
      this.recordRun(
        job.id,
        'ttl_cleanup',
        { before: beforeStats, dryRun },
        { 
          after: afterStats,
          transcriptsCleared,
          audioFilesDeleted,
          audioErrors: audioErrors.length > 0 ? audioErrors : undefined,
        },
        duration
      );

      console.log(`[TtlCleanupWorker] Cleanup completed in ${duration}ms`);

      return {
        success: true,
        data: {
          transcriptsCleared,
          audioFilesDeleted,
          audioErrors: audioErrors.length > 0 ? audioErrors : undefined,
          beforeStats,
          afterStats,
          durationMs: duration,
        },
      };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[TtlCleanupWorker] Error during cleanup:`, error);

      return {
        success: false,
        error,
        retryable: true,
      };
    }
  }

  /**
   * Get transcript storage statistics
   */
  private getTranscriptStats(): {
    totalWithTranscripts: number;
    expired: number;
    expiringSoon: number;
    totalAudioFiles: number;
  } {
    const now = new Date().toISOString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN transcript IS NOT NULL THEN 1 ELSE 0 END) as total_with_transcripts,
        SUM(CASE WHEN transcript_expires_at IS NOT NULL AND transcript_expires_at < ? THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN transcript_expires_at IS NOT NULL 
                  AND transcript_expires_at > ? 
                  AND transcript_expires_at < ? THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN audio_path IS NOT NULL THEN 1 ELSE 0 END) as total_audio_files
      FROM events
    `).get(now, now, tomorrow.toISOString()) as {
      total_with_transcripts: number;
      expired: number;
      expiring_soon: number;
      total_audio_files: number;
    };

    return {
      totalWithTranscripts: stats.total_with_transcripts || 0,
      expired: stats.expired || 0,
      expiringSoon: stats.expiring_soon || 0,
      totalAudioFiles: stats.total_audio_files || 0,
    };
  }

  /**
   * Record cleanup run for observability
   */
  private recordRun(
    jobId: string,
    jobType: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    durationMs: number
  ): void {
    const runId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot, output_snapshot, duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, 'success', ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      runId,
      jobId, // Use job ID as event ID for system jobs
      jobType,
      JSON.stringify(input),
      JSON.stringify(output),
      durationMs
    );
  }
}

export const ttlCleanupWorker = new TtlCleanupWorker();

/**
 * Schedule TTL cleanup job to run periodically
 * This enqueues a ttl_cleanup job at the specified interval
 */
export function scheduleTtlCleanupJob(intervalHours: number = 24): NodeJS.Timeout {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  console.log(`[TtlCleanupWorker] Scheduled TTL cleanup every ${intervalHours} hours`);
  
  // Enqueue first job
  const systemEventId = `system-ttl-${Date.now()}`;
  enqueue(systemEventId, 'ttl_cleanup' as any, {}, { maxAttempts: 3 });
  
  // Schedule periodic jobs
  return setInterval(() => {
    const eventId = `system-ttl-${Date.now()}`;
    console.log('[TtlCleanupWorker] Enqueuing scheduled TTL cleanup job');
    enqueue(eventId, 'ttl_cleanup' as any, {}, { maxAttempts: 3 });
  }, intervalMs);
}
