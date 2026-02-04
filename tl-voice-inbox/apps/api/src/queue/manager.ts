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
 * Enqueue a new job
 */
export function enqueue(
  eventId: string,
  type: JobType,
  payload: Record<string, unknown> = {},
  options: { maxAttempts?: number; runAt?: Date } = {}
): Job {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const runAt = options.runAt?.toISOString() || now;
  const maxAttempts = options.maxAttempts || 3;

  const stmt = db.prepare(`
    INSERT INTO jobs (id, event_id, type, status, payload, attempts, max_attempts, run_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?)
  `);

  stmt.run(id, eventId, type, JSON.stringify(payload), maxAttempts, runAt, now, now);

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
      ORDER BY run_at ASC, created_at ASC
      LIMIT 1
    `).get() as JobRow | undefined;

    if (!row) {
      return null;
    }

    // Immediately mark as running with row-level locking via UPDATE
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE jobs 
      SET status = 'running', 
          started_at = ?, 
          attempts = attempts + 1,
          updated_at = ?
      WHERE id = ? 
        AND status IN ('pending', 'retry')
    `);

    const result = updateStmt.run(now, now, row.id);

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
  const now = new Date().toISOString();
  
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
 * Will set to 'retry' if attempts < max_attempts, otherwise 'failed'
 */
export function fail(jobId: string, error: string, retryable: boolean = true): void {
  const now = new Date().toISOString();
  
  // Get current attempts and max_attempts
  const row = db.prepare('SELECT attempts, max_attempts FROM jobs WHERE id = ?').get(jobId) as 
    | { attempts: number; max_attempts: number }
    | undefined;
  
  if (!row) {
    throw new Error(`Job ${jobId} not found`);
  }

  const shouldRetry = retryable && row.attempts < row.max_attempts;
  const newStatus: JobStatus = shouldRetry ? 'retry' : 'failed';
  
  // Calculate next run time with exponential backoff (2^attempts minutes)
  const backoffMinutes = Math.pow(2, row.attempts);
  const runAt = shouldRetry 
    ? new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()
    : null;

  db.prepare(`
    UPDATE jobs 
    SET status = ?,
        error_message = ?,
        run_at = COALESCE(?, run_at),
        completed_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(newStatus, error, runAt, now, now, jobId);
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
} {
  const result = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) as retry,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM jobs
  `).get() as {
    pending: number;
    running: number;
    retry: number;
    completed: number;
    failed: number;
  };

  return {
    pending: result.pending || 0,
    running: result.running || 0,
    retry: result.retry || 0,
    completed: result.completed || 0,
    failed: result.failed || 0,
  };
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
