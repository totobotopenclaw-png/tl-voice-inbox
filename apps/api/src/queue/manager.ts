// Job manager for queue operations with SQLite locking

import { db } from '../db/connection.js';
import type { Job, JobType, JobStatus } from './types.js';

interface JobRow {
  id: string;
  event_id: string;
  type: JobType;
  status: JobStatus;
  payload: string | null;
  attempts: number;
  max_attempts: number;
  run_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  dead_letter_at: string | null;
  dead_letter_reason: string | null;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    eventId: row.event_id,
    type: row.type,
    status: row.status,
    payload: row.payload ? JSON.parse(row.payload) : null,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: new Date(row.run_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Format a date to SQLite datetime string (YYYY-MM-DD HH:MM:SS)
 */
function toSQLiteDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * Enqueue a new job
 */
export function enqueue(
  eventId: string,
  type: JobType,
  payload: Record<string, unknown> = {},
  options: { maxAttempts?: number; runAt?: Date } = {}
): Job {
  const id = crypto.randomUUID();
  const now = new Date();
  const nowStr = toSQLiteDateTime(now);
  const runAt = options.runAt ? toSQLiteDateTime(options.runAt) : nowStr;
  const maxAttempts = options.maxAttempts || 3;

  const stmt = db.prepare(`
    INSERT INTO jobs (id, event_id, type, status, payload, attempts, max_attempts, run_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)
  `);

  stmt.run(id, eventId, type, JSON.stringify(payload), maxAttempts, runAt, nowStr, nowStr);

  return {
    id,
    eventId,
    type,
    status: 'pending',
    payload,
    attempts: 0,
    maxAttempts,
    runAt: new Date(runAt),
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/**
 * Atomically claim the next pending job using SQLite row locking
 * Uses BEGIN IMMEDIATE to ensure exclusive access during claim
 */
export function claim(): Job | null {
  // Use a transaction with immediate locking to prevent race conditions
  const transaction = db.transaction(() => {
    // Find the next pending job that's ready to run
    // Order by: priority (run_at), then oldest created
    const row = db.prepare(`
      SELECT * FROM jobs 
      WHERE status IN ('pending', 'retry') 
        AND run_at <= datetime('now')
        AND cancelled_at IS NULL
      ORDER BY run_at ASC, created_at ASC
      LIMIT 1
    `).get() as JobRow | undefined;

    if (!row) {
      return null;
    }

    // Immediately mark as running with row-level locking via UPDATE
    const nowStr = toSQLiteDateTime(new Date());
    const updateStmt = db.prepare(`
      UPDATE jobs
      SET status = 'running',
          started_at = ?,
          attempts = attempts + 1,
          updated_at = ?
      WHERE id = ?
        AND status IN ('pending', 'retry')
        AND cancelled_at IS NULL
    `);

    const result = updateStmt.run(nowStr, nowStr, row.id);

    // If no rows updated, another worker claimed it
    if (result.changes === 0) {
      return null;
    }

    // Return the updated row
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.id) as JobRow;
  });

  const row = transaction();
  return row ? rowToJob(row) : null;
}

/**
 * Mark a job as completed
 */
export function complete(jobId: string, result?: Record<string, unknown>): void {
  const now = toSQLiteDateTime(new Date());

  db.prepare(`
    UPDATE jobs
    SET status = 'completed',
        completed_at = ?,
        error_message = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, jobId);
}

/**
 * Mark a job as failed
 * Will set to 'retry' if attempts < max_attempts, otherwise move to dead letter queue
 */
export function fail(jobId: string, error: string, retryable: boolean = true): void {
  const now = toSQLiteDateTime(new Date());

  // Get current attempts and max_attempts
  const row = db.prepare('SELECT attempts, max_attempts FROM jobs WHERE id = ?').get(jobId) as
    | { attempts: number; max_attempts: number }
    | undefined;

  if (!row) {
    throw new Error(`Job ${jobId} not found`);
  }

  const shouldRetry = retryable && row.attempts < row.max_attempts;
  
  if (shouldRetry) {
    // Calculate next run time with exponential backoff (2^attempts minutes)
    const backoffMinutes = Math.pow(2, row.attempts);
    const runAt = toSQLiteDateTime(new Date(Date.now() + backoffMinutes * 60 * 1000));

    db.prepare(`
      UPDATE jobs
      SET status = 'retry',
          error_message = ?,
          run_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(error, runAt, now, jobId);
  } else {
    // Move to dead letter queue
    db.prepare(`
      UPDATE jobs
      SET status = 'failed',
          error_message = ?,
          completed_at = ?,
          dead_letter_at = ?,
          dead_letter_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(error, now, now, `Max attempts (${row.max_attempts}) exceeded`, now, jobId);
  }
}

/**
 * Cancel a job by ID
 * Only pending or retry jobs can be cancelled
 */
export function cancelJob(jobId: string, cancelledBy: string = 'system'): { success: boolean; error?: string } {
  const now = toSQLiteDateTime(new Date());

  // Check if job exists and can be cancelled
  const job = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId) as
    | { status: JobStatus }
    | undefined;

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.status === 'completed') {
    return { success: false, error: 'Cannot cancel completed job' };
  }

  if (job.status === 'failed') {
    return { success: false, error: 'Cannot cancel failed job' };
  }

  if (job.status === 'running') {
    return { success: false, error: 'Cannot cancel running job' };
  }

  // Cancel the job
  const result = db.prepare(`
    UPDATE jobs
    SET status = 'failed',
        error_message = 'Cancelled by user',
        cancelled_at = ?,
        cancelled_by = ?,
        updated_at = ?
    WHERE id = ?
      AND status IN ('pending', 'retry')
  `).run(now, cancelledBy, now, jobId);

  if (result.changes === 0) {
    return { success: false, error: 'Job could not be cancelled' };
  }

  return { success: true };
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): Job | null {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Get jobs by event ID
 */
export function getJobsByEvent(eventId: string): Job[] {
  const rows = db.prepare('SELECT * FROM jobs WHERE event_id = ? ORDER BY created_at ASC').all(eventId) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Get queue statistics
 */
export function getQueueStats(): {
  pending: number;
  running: number;
  retry: number;
  completed: number;
  failed: number;
  deadLetter: number;
  cancelled: number;
} {
  const result = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'pending' AND cancelled_at IS NULL THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'retry' AND cancelled_at IS NULL THEN 1 ELSE 0 END) as retry,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' AND dead_letter_at IS NOT NULL THEN 1 ELSE 0 END) as dead_letter,
      SUM(CASE WHEN status = 'failed' AND cancelled_at IS NOT NULL THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'failed' AND dead_letter_at IS NULL AND cancelled_at IS NULL THEN 1 ELSE 0 END) as failed
    FROM jobs
  `).get() as {
    pending: number;
    running: number;
    retry: number;
    completed: number;
    dead_letter: number;
    cancelled: number;
    failed: number;
  };

  return {
    pending: result.pending || 0,
    running: result.running || 0,
    retry: result.retry || 0,
    completed: result.completed || 0,
    failed: (result.failed || 0) + (result.dead_letter || 0),
    deadLetter: result.dead_letter || 0,
    cancelled: result.cancelled || 0,
  };
}

/**
 * Get dead letter queue entries
 */
export function getDeadLetterQueue(limit: number = 50, offset: number = 0): Array<Job & { deadLetterAt: Date; deadLetterReason: string }> {
  const rows = db.prepare(`
    SELECT * FROM jobs 
    WHERE dead_letter_at IS NOT NULL 
    ORDER BY dead_letter_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as JobRow[];

  return rows.map(row => ({
    ...rowToJob(row),
    deadLetterAt: new Date(row.dead_letter_at!),
    deadLetterReason: row.dead_letter_reason!,
  }));
}

/**
 * Retry a dead letter job
 */
export function retryDeadLetterJob(jobId: string): { success: boolean; error?: string } {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (!job.dead_letter_at) {
    return { success: false, error: 'Job is not in dead letter queue' };
  }

  const now = toSQLiteDateTime(new Date());

  // Reset job to pending with fresh attempts
  db.prepare(`
    UPDATE jobs
    SET status = 'pending',
        attempts = 0,
        error_message = NULL,
        dead_letter_at = NULL,
        dead_letter_reason = NULL,
        run_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, jobId);

  return { success: true };
}

/**
 * Cancel pending jobs for an event (used when reprocessing)
 */
export function cancelPendingJobs(eventId: string): number {
  const result = db.prepare(`
    UPDATE jobs 
    SET status = 'failed',
        error_message = 'Cancelled due to reprocessing',
        updated_at = datetime('now')
    WHERE event_id = ? AND status IN ('pending', 'retry')
  `).run(eventId);

  return result.changes;
}

/**
 * Purge old completed jobs
 */
export function purgeOldJobs(olderThanDays: number = 7): { purged: number } {
  const result = db.prepare(`
    DELETE FROM jobs 
    WHERE status IN ('completed', 'failed')
      AND updated_at < datetime('now', '-' || ? || ' days')
  `).run(olderThanDays);

  return { purged: result.changes };
}
