// Events routes - create events and enqueue STT jobs

import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { enqueue } from '../queue/manager.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function eventsRoutes(server: FastifyInstance): Promise<void> {
  
  // POST /api/events - Create new event from audio upload
  server.post('/', async (request, reply) => {
    const parts = request.parts();
    
    let audioBuffer: Buffer | null = null;
    let audioFilename = 'recording.webm';
    let language = 'es';
    
    for await (const part of parts) {
      if (part.type === 'file') {
        audioBuffer = await part.toBuffer();
        audioFilename = part.filename || 'recording.webm';
      } else if (part.type === 'field') {
        if (part.fieldname === 'language') {
          language = part.value as string;
        }
      }
    }
    
    if (!audioBuffer) {
      reply.status(400);
      return { error: 'No audio file provided' };
    }
    
    // Generate IDs
    const eventId = crypto.randomUUID();
    const timestamp = Date.now();
    const audioPath = path.join(UPLOADS_DIR, `${eventId}_${timestamp}_${audioFilename}`);
    
    // Save audio file
    fs.writeFileSync(audioPath, audioBuffer);
    
    // Create event record
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO events (id, audio_path, status, created_at, updated_at)
      VALUES (?, ?, 'queued', ?, ?)
    `).run(eventId, audioPath, now, now);
    
    // Enqueue STT job
    const job = enqueue(eventId, 'stt', {
      audioPath,
      language,
    });
    
    console.log(`[Events] Created event ${eventId} with STT job ${job.id}`);
    
    reply.status(201);
    return {
      eventId,
      jobId: job.id,
      status: 'queued',
      createdAt: now,
    };
  });

  // GET /api/events - List events
  server.get('/', async (request) => {
    const { status, limit = '50', offset = '0' } = request.query as { 
      status?: string; 
      limit?: string; 
      offset?: string;
    };
    
    let query = 'SELECT * FROM events';
    const params: string[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = db.prepare(query).all(...params) as Array<{
      id: string;
      audio_path: string | null;
      transcript: string | null;
      transcript_expires_at: string | null;
      status: string;
      status_reason: string | null;
      detected_command: string | null;
      created_at: string;
      updated_at: string;
    }>;
    
    return {
      events: rows.map(row => ({
        id: row.id,
        audioPath: row.audio_path,
        hasTranscript: !!row.transcript,
        transcriptPreview: row.transcript 
          ? row.transcript.substring(0, 200) + (row.transcript.length > 200 ? '...' : '')
          : null,
        transcriptExpiresAt: row.transcript_expires_at,
        status: row.status,
        statusReason: row.status_reason,
        detectedCommand: row.detected_command,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

  // GET /api/events/:id - Get event details
  server.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | {
          id: string;
          audio_path: string | null;
          transcript: string | null;
          transcript_expires_at: string | null;
          status: string;
          status_reason: string | null;
          detected_command: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    
    if (!row) {
      reply.status(404);
      return { error: 'Event not found' };
    }
    
    // Get related jobs
    const jobs = db.prepare('SELECT * FROM jobs WHERE event_id = ? ORDER BY created_at ASC').all(id) as Array<{
      id: string;
      type: string;
      status: string;
      attempts: number;
      max_attempts: number;
      error_message: string | null;
      created_at: string;
      completed_at: string | null;
    }>;
    
    return {
      event: {
        id: row.id,
        audioPath: row.audio_path,
        transcript: row.transcript,
        transcriptExpiresAt: row.transcript_expires_at,
        status: row.status,
        statusReason: row.status_reason,
        detectedCommand: row.detected_command,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      jobs: jobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
        errorMessage: j.error_message,
        createdAt: j.created_at,
        completedAt: j.completed_at,
      })),
    };
  });
}
