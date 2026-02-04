// STT Worker - transcribes audio using whisper.cpp

import type { Job, Worker, JobResult, SttJobPayload } from '../../queue/types.js';
import { enqueue } from '../../queue/manager.js';
import { db } from '../../db/connection.js';
import { ensureModel, getModelPath, type WhisperModelSize } from './model-manager.js';
import { transcribe, checkWhisperCli, convertToWav } from './whisper.js';
import fs from 'fs';

// Configuration
const DEFAULT_MODEL_SIZE: WhisperModelSize = (process.env.WHISPER_MODEL as WhisperModelSize) || 'tiny';
const TRANSCRIPT_TTL_DAYS = parseInt(process.env.TRANSCRIPT_TTL_DAYS || '14', 10);

export class SttWorker implements Worker {
  readonly type = 'stt' as const;
  private modelPath: string | null = null;
  private whisperAvailable = false;

  async initialize(): Promise<void> {
    console.log('[SttWorker] Initializing...');
    
    // Check whisper-cli availability
    const check = await checkWhisperCli();
    if (!check.available) {
      console.error('[SttWorker] Warning:', check.error);
      console.error('[SttWorker] STT jobs will fail until whisper.cpp is installed');
      this.whisperAvailable = false;
    } else {
      console.log(`[SttWorker] whisper-cli available (version: ${check.version})`);
      this.whisperAvailable = true;
    }

    // Ensure model is downloaded
    try {
      this.modelPath = await ensureModel(DEFAULT_MODEL_SIZE);
      console.log(`[SttWorker] Model ready: ${this.modelPath}`);
    } catch (err) {
      console.error('[SttWorker] Failed to download model:', err);
      // Don't throw - we'll retry on each job
    }
  }

  async process(job: Job): Promise<JobResult> {
    console.log(`[SttWorker] Processing job ${job.id} for event ${job.eventId}`);

    if (!this.whisperAvailable) {
      // Re-check whisper availability
      const check = await checkWhisperCli();
      if (!check.available) {
        return {
          success: false,
          error: `whisper-cli not available: ${check.error}`,
          retryable: true,
        };
      }
      this.whisperAvailable = true;
    }

    const payload = job.payload as SttJobPayload | null;
    
    if (!payload?.audioPath) {
      return {
        success: false,
        error: 'Missing audioPath in job payload',
        retryable: false,
      };
    }

    // Ensure model is available
    if (!this.modelPath) {
      try {
        this.modelPath = await ensureModel(DEFAULT_MODEL_SIZE);
      } catch (err) {
        return {
          success: false,
          error: `Failed to ensure model: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
        };
      }
    }

    // Verify audio file exists
    if (!fs.existsSync(payload.audioPath)) {
      return {
        success: false,
        error: `Audio file not found: ${payload.audioPath}`,
        retryable: false,
      };
    }

    // Convert to WAV if needed
    let audioPath = payload.audioPath;
    if (!audioPath.endsWith('.wav')) {
      console.log(`[SttWorker] Converting to WAV: ${audioPath}`);
      const conversion = await convertToWav(audioPath);
      
      if (!conversion.success) {
        console.warn(`[SttWorker] Conversion failed: ${conversion.error}`);
        console.warn('[SttWorker] Attempting transcription with original file...');
      } else if (conversion.path) {
        audioPath = conversion.path;
      }
    }

    // Run transcription
    const result = await transcribe(audioPath, this.modelPath, {
      language: payload.language || 'es',
      threads: parseInt(process.env.WHISPER_THREADS || '4', 10),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Transcription failed',
        retryable: true,
      };
    }

    // Update event with transcript
    const transcript = result.text;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRANSCRIPT_TTL_DAYS);

    try {
      const updateStmt = db.prepare(`
        UPDATE events 
        SET transcript = ?,
            transcript_expires_at = ?,
            status = 'transcribed',
            updated_at = datetime('now')
        WHERE id = ?
      `);
      
      updateStmt.run(transcript, expiresAt.toISOString(), job.eventId);
      console.log(`[SttWorker] Event ${job.eventId} updated with transcript (${transcript.length} chars)`);

      // Record in event_runs for observability
      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot, output_snapshot, duration_ms, created_at, updated_at)
        VALUES (?, ?, 'stt', 'success', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        runId,
        job.eventId,
        JSON.stringify({ audioPath: payload.audioPath, language: payload.language || 'es' }),
        JSON.stringify({ transcript: transcript.substring(0, 500) + (transcript.length > 500 ? '...' : '') }),
        Math.round((result.duration || 0) * 1000)
      );

      // Enqueue next job: extract
      const extractJob = enqueue(job.eventId, 'extract', {
        transcript,
        language: payload.language || 'es',
      });
      
      console.log(`[SttWorker] Enqueued extract job ${extractJob.id} for event ${job.eventId}`);

      return {
        success: true,
        data: {
          transcriptLength: transcript.length,
          language: result.language,
          duration: result.duration,
          nextJobId: extractJob.id,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update event: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }
  }
}

// Export singleton instance
export const sttWorker = new SttWorker();
