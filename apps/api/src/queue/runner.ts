// Worker runner - polls for jobs and dispatches to workers

import { claim, complete, fail } from './manager.js';
import type { Job, Worker, JobResult } from './types.js';

interface WorkerRunnerOptions {
  pollIntervalMs?: number;
  maxConcurrent?: number;
  shutdownTimeoutMs?: number;
}

export class WorkerRunner {
  private workers = new Map<string, Worker>();
  private runningJobs = new Map<string, AbortController>();
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly shutdownTimeoutMs: number;

  constructor(options: WorkerRunnerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 3000; // 3 seconds default
    this.maxConcurrent = options.maxConcurrent || 2;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs || 30000; // 30 seconds
  }

  /**
   * Register a worker for a job type
   */
  register(worker: Worker): void {
    this.workers.set(worker.type, worker);
    console.log(`[WorkerRunner] Registered worker for job type: ${worker.type}`);
  }

  /**
   * Start the worker runner
   */
  start(): void {
    if (this.isRunning) {
      console.log('[WorkerRunner] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[WorkerRunner] Starting with poll interval:', this.pollIntervalMs, 'ms');

    // Immediate first poll
    this.poll();

    // Schedule regular polling
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Stop the worker runner gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[WorkerRunner] Stopping gracefully...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for running jobs to complete or timeout
    if (this.runningJobs.size > 0) {
      console.log(`[WorkerRunner] Waiting for ${this.runningJobs.size} jobs to complete...`);
      
      const abortControllers = Array.from(this.runningJobs.values());
      
      // Set a timeout to force abort
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.log('[WorkerRunner] Shutdown timeout reached, aborting jobs...');
          abortControllers.forEach(controller => controller.abort());
          resolve();
        }, this.shutdownTimeoutMs);
      });

      // Wait for all jobs to complete
      const jobsPromise = Promise.all(
        Array.from(this.runningJobs.keys()).map(jobId => 
          new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (!this.runningJobs.has(jobId)) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          })
        )
      );

      await Promise.race([jobsPromise, timeoutPromise]);
    }

    console.log('[WorkerRunner] Stopped');
  }

  /**
   * Poll for jobs and process them
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Don't poll if at max concurrency
    if (this.runningJobs.size >= this.maxConcurrent) {
      return;
    }

    // Try to claim jobs up to max concurrent
    const availableSlots = this.maxConcurrent - this.runningJobs.size;
    
    for (let i = 0; i < availableSlots; i++) {
      const job = claim();
      
      if (!job) {
        // No more jobs available
        break;
      }

      const worker = this.workers.get(job.type);
      
      if (!worker) {
        console.error(`[WorkerRunner] No worker registered for job type: ${job.type}`);
        fail(job.id, `No worker registered for job type: ${job.type}`, false);
        continue;
      }

      // Process job in background
      this.processJob(job, worker);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job, worker: Worker): Promise<void> {
    const abortController = new AbortController();
    this.runningJobs.set(job.id, abortController);

    console.log(`[WorkerRunner] Processing job ${job.id} (${job.type}) for event ${job.eventId}`);
    const startTime = Date.now();

    try {
      const result = await worker.process(job);
      const duration = Date.now() - startTime;

      if (result.success) {
        complete(job.id, result.data);
        console.log(`[WorkerRunner] Job ${job.id} completed in ${duration}ms`);
      } else {
        fail(job.id, result.error, result.retryable !== false);
        console.error(`[WorkerRunner] Job ${job.id} failed: ${result.error}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      fail(job.id, errorMessage, true);
      console.error(`[WorkerRunner] Job ${job.id} crashed after ${duration}ms: ${errorMessage}`);
    } finally {
      this.runningJobs.delete(job.id);
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    registeredWorkers: string[];
    runningJobs: string[];
    maxConcurrent: number;
  } {
    return {
      isRunning: this.isRunning,
      registeredWorkers: Array.from(this.workers.keys()),
      runningJobs: Array.from(this.runningJobs.keys()),
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
let runner: WorkerRunner | null = null;

export function getWorkerRunner(): WorkerRunner {
  if (!runner) {
    runner = new WorkerRunner({
      pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '3000', 10),
      maxConcurrent: parseInt(process.env.WORKER_MAX_CONCURRENT || '2', 10),
    });
  }
  return runner;
}
