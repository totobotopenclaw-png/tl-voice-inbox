import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { db } from './db/connection.js';
import { searchRoutes, healthRoutes, adminRoutes, eventsRoutes } from './routes/index.js';
import { getWorkerRunner } from './queue/runner.js';
import { sttWorker } from './workers/stt/index.js';
import { extractWorker } from './workers/extract/index.js';
import { scheduleCleanup } from './ttl/manager.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = Fastify({
  logger: {
    level: 'info',
  },
});

// Register multipart plugin for file uploads
await server.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

// Register routes
server.register(healthRoutes, { prefix: '/api' });
server.register(searchRoutes, { prefix: '/api' });
server.register(adminRoutes, { prefix: '/api/admin' });
server.register(eventsRoutes, { prefix: '/api/events' });

// Initialize and start workers
async function initializeWorkers(): Promise<void> {
  console.log('[Server] Initializing workers...');
  
  // Initialize STT worker (downloads model if needed)
  await sttWorker.initialize();
  
  // Register workers with runner
  const runner = getWorkerRunner();
  runner.register(sttWorker);
  runner.register(extractWorker);
  
  // Start the runner
  runner.start();
  
  console.log('[Server] Workers initialized and started');
}

// Schedule periodic cleanup
let cleanupInterval: NodeJS.Timeout | null = null;

function initializeCleanup(): void {
  const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24', 10);
  cleanupInterval = scheduleCleanup(intervalHours);
}

// Graceful shutdown
async function closeGracefully(signal: string): Promise<void> {
  server.log.info(`Received signal ${signal}, closing gracefully...`);
  
  // Stop worker runner
  const runner = getWorkerRunner();
  await runner.stop();
  
  // Clear cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  // Close server and DB
  await server.close();
  db.close();
  
  server.log.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Start server
try {
  // Initialize workers before starting server
  await initializeWorkers();
  
  // Start cleanup scheduler
  initializeCleanup();
  
  await server.listen({ port: PORT, host: HOST });
  server.log.info(`Server listening on http://${HOST}:${PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
