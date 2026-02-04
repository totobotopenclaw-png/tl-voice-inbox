// Admin routes - queue status, model management, cleanup

import type { FastifyInstance } from 'fastify';
import { getQueueStats } from '../queue/manager.js';
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

  // POST /api/admin/purge-transcripts - Purge expired transcripts
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
