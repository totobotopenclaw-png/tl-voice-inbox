// Admin routes - queue status, model management, cleanup

import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { 
  getQueueStats, 
  cancelJob, 
  getDeadLetterQueue, 
  retryDeadLetterJob,
  purgeOldJobs,
} from '../queue/manager.js';
import { getWorkerRunner } from '../queue/runner.js';
import { runCleanup, getTranscriptStats } from '../ttl/manager.js';
import { listModels, ensureModel, deleteModel, checkModel, type WhisperModelSize } from '../workers/stt/model-manager.js';

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  
  // GET /api/admin/queue - Queue statistics
  server.get('/queue', async () => {
    const stats = getQueueStats();
    const runner = getWorkerRunner();
    const status = runner.getStatus();
    
    return {
      queue: stats,
      runner: {
        isRunning: status.isRunning,
        registeredWorkers: status.registeredWorkers,
        runningJobs: status.runningJobs,
        maxConcurrent: status.maxConcurrent,
      },
    };
  });

  // GET /api/admin/queue/dead-letter - Get dead letter queue
  server.get('/queue/dead-letter', async (request) => {
    const { limit = '50', offset = '0' } = request.query as { 
      limit?: string; 
      offset?: string;
    };
    
    const jobs = getDeadLetterQueue(parseInt(limit, 10), parseInt(offset, 10));
    
    return {
      jobs: jobs.map(j => ({
        id: j.id,
        eventId: j.eventId,
        type: j.type,
        status: j.status,
        attempts: j.attempts,
        maxAttempts: j.maxAttempts,
        errorMessage: j.errorMessage,
        deadLetterAt: j.deadLetterAt,
        deadLetterReason: j.deadLetterReason,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
      count: jobs.length,
    };
  });

  // POST /api/admin/queue/dead-letter/:id/retry - Retry a dead letter job
  server.post<{ Params: { id: string } }>('/queue/dead-letter/:id/retry', async (request, reply) => {
    const { id } = request.params;
    
    const result = retryDeadLetterJob(id);
    
    if (!result.success) {
      reply.status(400);
      return { success: false, error: result.error };
    }
    
    return { success: true, message: 'Job queued for retry' };
  });

  // POST /api/admin/queue/jobs/:id/cancel - Cancel a pending job
  server.post<{ Params: { id: string } }>('/queue/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params;
    const { cancelledBy = 'user' } = request.body as { cancelledBy?: string };
    
    const result = cancelJob(id, cancelledBy);
    
    if (!result.success) {
      reply.status(400);
      return { success: false, error: result.error };
    }
    
    return { success: true, message: 'Job cancelled successfully' };
  });

  // POST /api/admin/queue/purge - Purge old completed/failed jobs
  server.post('/queue/purge', async (request) => {
    const { olderThanDays = '7' } = request.body as { olderThanDays?: string };
    
    const result = purgeOldJobs(parseInt(olderThanDays, 10));
    
    return {
      success: true,
      purged: result.purged,
    };
  });

  // GET /api/admin/models - List available STT models
  server.get('/models', async () => {
    const models = listModels();
    return {
      models: models.map(m => ({
        name: m.name,
        exists: m.exists,
        size: m.size,
        isValid: m.isValid,
        path: m.path,
      })),
      defaultModel: process.env.WHISPER_MODEL || 'tiny',
    };
  });

  // POST /api/admin/models/download - Download a model
  server.post<{
    Body: { size?: WhisperModelSize };
  }>('/models/download', async (request, reply) => {
    const size = request.body?.size || 'tiny';
    
    try {
      const modelPath = await ensureModel(size);
      const info = checkModel(size);
      
      return {
        success: true,
        model: {
          size,
          path: modelPath,
          exists: info.exists,
          isValid: info.isValid,
        },
      };
    } catch (err) {
      reply.status(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // DELETE /api/admin/models/:size - Delete a model
  server.delete<{
    Params: { size: WhisperModelSize };
  }>('/models/:size', async (request, reply) => {
    const { size } = request.params;
    
    try {
      const deleted = deleteModel(size);
      
      if (!deleted) {
        reply.status(404);
        return {
          success: false,
          error: `Model ${size} not found`,
        };
      }
      
      return {
        success: true,
        message: `Model ${size} deleted`,
      };
    } catch (err) {
      reply.status(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // GET /api/admin/transcripts - Transcript statistics
  server.get('/transcripts', async () => {
    const stats = getTranscriptStats();
    return {
      stats,
      ttlDays: parseInt(process.env.TRANSCRIPT_TTL_DAYS || '14', 10),
    };
  });

  // POST /api/admin/purge-transcripts - Purge expired transcripts (legacy name)
  server.post('/purge-transcripts', async () => {
    const result = runCleanup();
    
    return {
      success: true,
      result: {
        transcriptsCleared: result.transcriptsCleared,
        audioFilesDeleted: result.audioFilesDeleted,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    };
  });

  // POST /api/admin/purge-expired - Purge expired transcripts (PRD name)
  server.post('/purge-expired', async () => {
    const result = runCleanup();
    
    return {
      success: true,
      result: {
        transcriptsCleared: result.transcriptsCleared,
        audioFilesDeleted: result.audioFilesDeleted,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
    };
  });

  // GET /api/admin/stats - Observability metrics
  server.get('/stats', async () => {
    // Event stats
    const eventStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'queued' OR status = 'transcribing' OR status = 'transcribed' OR status = 'processing' THEN 1 ELSE 0 END) as in_progress
      FROM events
    `).get() as { total: number; needs_review: number; completed: number; failed: number; in_progress: number };

    // Action stats
    const actionStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN due_at IS NOT NULL AND due_at < datetime('now') AND completed_at IS NULL THEN 1 ELSE 0 END) as overdue
      FROM actions
    `).get() as { total: number; pending: number; completed: number; overdue: number };

    // Event run metrics (latency and failures)
    const runMetrics = db.prepare(`
      SELECT 
        AVG(CASE WHEN status = 'success' THEN duration_ms END) as avg_latency,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failures,
        SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) as retries,
        COUNT(*) as total_runs
      FROM event_runs
      WHERE created_at >= datetime('now', '-24 hours')
    `).get() as { avg_latency: number | null; failures: number; retries: number; total_runs: number };

    // Queue stats
    const queueStats = getQueueStats();

    // Needs review ratio
    const needsReviewRatio = eventStats.total > 0 
      ? eventStats.needs_review / eventStats.total 
      : 0;

    return {
      events: {
        total: eventStats.total,
        needsReview: eventStats.needs_review,
        completed: eventStats.completed,
        failed: eventStats.failed,
        inProgress: eventStats.in_progress,
        needsReviewRatio: Math.round(needsReviewRatio * 1000) / 1000, // 3 decimal places
      },
      actions: actionStats,
      performance: {
        avgLatencyMs: Math.round(runMetrics.avg_latency || 0),
        failures24h: runMetrics.failures,
        retries24h: runMetrics.retries,
        totalRuns24h: runMetrics.total_runs,
        successRate: runMetrics.total_runs > 0 
          ? Math.round(((runMetrics.total_runs - runMetrics.failures) / runMetrics.total_runs) * 1000) / 10 
          : 100,
      },
      queue: queueStats,
      timestamp: new Date().toISOString(),
    };
  });

  // POST /api/admin/workers/stop - Stop the worker runner
  server.post('/workers/stop', async () => {
    const runner = getWorkerRunner();
    await runner.stop();
    
    return {
      success: true,
      message: 'Worker runner stopped',
    };
  });

  // POST /api/admin/workers/start - Start the worker runner
  server.post('/workers/start', async () => {
    const runner = getWorkerRunner();
    runner.start();
    
    return {
      success: true,
      message: 'Worker runner started',
      status: runner.getStatus(),
    };
  });
}
