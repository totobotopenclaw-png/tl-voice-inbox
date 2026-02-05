import type { FastifyInstance } from 'fastify';
import { getQueueStats } from '../queue/manager.js';
import { checkWhisperCli } from '../workers/stt/whisper.js';
import { llmManager } from '../llm/manager.js';

let checksCache: { whisper: boolean; llm: boolean } | null = null;
let lastCheck = 0;

async function getDependencyStatus(): Promise<{ whisper: boolean; llm: boolean }> {
  // Cache for 30 seconds to avoid constant checks
  const now = Date.now();
  if (checksCache && now - lastCheck < 30000) {
    return checksCache;
  }

  const [whisperCheck, llmStatus] = await Promise.all([
    checkWhisperCli().then(r => r.available).catch(() => false),
    Promise.resolve(llmManager.getStatus()),
  ]);

  checksCache = { whisper: whisperCheck, llm: llmStatus.isRunning };
  lastCheck = now;
  return checksCache;
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic health check
  fastify.get('/health', async () => {
    const deps = await getDependencyStatus();
    const queue = getQueueStats();

    const allOk = deps.whisper && deps.llm;

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
      dependencies: {
        whisper: deps.whisper ? 'available' : 'unavailable',
        llm: deps.llm ? 'running' : 'stopped',
      },
      queue,
    };
  });

  // Liveness probe - just checks if server is up
  fastify.get('/health/live', async () => {
    return { status: 'alive' };
  });

  // Readiness probe - checks if ready to accept work
  fastify.get('/health/ready', async (request, reply) => {
    const deps = await getDependencyStatus();

    if (!deps.whisper) {
      return reply.status(503).send({
        status: 'not ready',
        reason: 'whisper-cli not available',
      });
    }

    return { status: 'ready' };
  });
}
