// Admin LLM routes - LLM server management

import type { FastifyInstance } from 'fastify';
import { llmManager, type ModelInfo } from '../llm/manager.js';

export async function llmAdminRoutes(server: FastifyInstance): Promise<void> {

  // GET /api/admin/llm/status - LLM server health
  server.get('/status', async () => {
    const status = llmManager.getStatus();
    const isHealthy = await llmManager.checkHealth();
    
    return {
      status: isHealthy ? 'healthy' : status.isRunning ? 'unhealthy' : 'stopped',
      ...status,
      uptimeSeconds: status.uptimeMs ? Math.floor(status.uptimeMs / 1000) : null,
    };
  });

  // POST /api/admin/llm/start - Start llama-server
  server.post('/start', async (request, reply) => {
    try {
      const body = request.body as { 
        port?: number; 
        contextSize?: number; 
        threads?: number;
        batchSize?: number;
        gpuLayers?: number;
      } | null;

      await llmManager.start(body || undefined);
      const status = llmManager.getStatus();
      
      return {
        success: true,
        status: {
          isRunning: status.isRunning,
          port: status.port,
          pid: status.pid,
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

  // POST /api/admin/llm/stop - Stop llama-server
  server.post('/stop', async (request, reply) => {
    try {
      await llmManager.stop();
      const status = llmManager.getStatus();
      
      return {
        success: true,
        status,
      };
    } catch (err) {
      reply.status(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // POST /api/admin/llm/restart - Restart llama-server
  server.post('/restart', async (request, reply) => {
    try {
      const body = request.body as { 
        port?: number; 
        contextSize?: number; 
        threads?: number;
        batchSize?: number;
        gpuLayers?: number;
      } | null;

      await llmManager.restart(body || undefined);
      const status = llmManager.getStatus();
      
      return {
        success: true,
        status: {
          isRunning: status.isRunning,
          port: status.port,
          pid: status.pid,
          uptimeSeconds: status.uptimeMs ? Math.floor(status.uptimeMs / 1000) : null,
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

  // GET /api/admin/llm/models - List available LLM models
  server.get('/models', async () => {
    const defaultModel = llmManager.checkModel();
    
    return {
      models: [defaultModel],
      defaultModel: defaultModel.name,
      modelsDir: process.env.LLM_MODELS_DIR || './data/models',
    };
  });

  // POST /api/admin/llm/models/download - Download a model
  server.post('/models/download', async (request, reply) => {
    const body = request.body as { url?: string; name?: string } | null;
    
    try {
      const url = body?.url;
      const name = body?.name;
      
      console.log(`[LLM API] Downloading model from ${url || 'default URL'}`);
      
      const info = await llmManager.downloadModel(url, name, (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
        process.stdout.write(`\r[LLM API] Progress: ${percent}% (${mb}MB / ${totalMb}MB)`);
      });
      process.stdout.write('\n');
      
      return {
        success: true,
        model: {
          name: info.name,
          path: info.path,
          size: info.size,
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

  // DELETE /api/admin/llm/models/:name - Delete a model
  server.delete('/models/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    
    try {
      const modelPath = llmManager.getModelPath(name);
      const fs = await import('fs');
      
      if (!fs.existsSync(modelPath)) {
        reply.status(404);
        return {
          success: false,
          error: `Model ${name} not found`,
        };
      }
      
      fs.unlinkSync(modelPath);
      
      return {
        success: true,
        message: `Model ${name} deleted`,
      };
    } catch (err) {
      reply.status(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
