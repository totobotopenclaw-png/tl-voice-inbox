// Events routes - create events and enqueue STT jobs
// Updated for M5: Needs review flow + epic candidates

import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { enqueue } from '../queue/manager.js';
import { 
  getStoredCandidates, 
  findEpicCandidates, 
  storeEpicCandidates,
  findEpicById 
} from '../services/epic-matcher.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface ResolveEventBody {
  epicId: string | null;
}

export async function eventsRoutes(server: FastifyInstance): Promise<void> {

  // POST /api/events/test - Create test event from text (for testing only)
  server.post('/test', async (request, reply) => {
    const body = request.body as { title?: string; rawTranscript?: string };
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
      VALUES (?, NULL, 'transcribed', ?, ?, ?)
    `).run(eventId, body.rawTranscript || body.title || 'Test', now, now);

    // Enqueue extract job directly
    const job = enqueue(eventId, 'extract', { transcript: body.rawTranscript || body.title });
    console.log(`[Events] Created test event ${eventId} with extract job ${job.id}`);

    reply.status(201);
    return { eventId, jobId: job.id, status: 'transcribed', createdAt: now };
  });

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
  // Supports ?status=needs_review for ambiguity queue
  server.get('/', async (request) => {
    const { status, limit = '50', offset = '0' } = request.query as { 
      status?: string; 
      limit?: string; 
      offset?: string;
    };
    
    let query = 'SELECT * FROM events';
    const params: (string | number)[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    
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
    
    // Get candidates if event is in needs_review status
    let candidates = null;
    if (row.status === 'needs_review') {
      candidates = getStoredCandidates(id);
    }
    
    // Get assigned epic if any (stored in status_reason as epic_id)
    let assignedEpic = null;
    if (row.status === 'completed' || row.status === 'processing') {
      // Try to find the epic from actions created from this event
      const epicRow = db.prepare(`
        SELECT DISTINCT e.id, e.title
        FROM actions a
        JOIN epics e ON a.epic_id = e.id
        WHERE a.source_event_id = ?
        LIMIT 1
      `).get(id) as { id: string; title: string } | undefined;
      
      if (epicRow) {
        assignedEpic = epicRow;
      }
    }
    
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
      candidates,
      assignedEpic,
    };
  });
  
  // PATCH /api/events/:id - Update event transcript
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { transcript?: string };

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | { id: string; transcript: string | null }
      | undefined;

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (body.transcript !== undefined) {
      db.prepare('UPDATE events SET transcript = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(body.transcript, id);
    }

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
    return { event: updated };
  });

  // GET /api/events/:id/candidates - Get top epic candidates for event
  server.get<{ Params: { id: string } }>('/:id/candidates', async (request, reply) => {
    const { id } = request.params;
    
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | { transcript: string | null; status: string }
      | undefined;
    
    if (!event) {
      reply.status(404);
      return { error: 'Event not found' };
    }
    
    // Return stored candidates if available
    const stored = getStoredCandidates(id);
    if (stored.length > 0) {
      return {
        eventId: id,
        candidates: stored,
        source: 'stored',
      };
    }
    
    // If no stored candidates but we have transcript, calculate on the fly
    if (event.transcript) {
      const result = findEpicCandidates(event.transcript);
      return {
        eventId: id,
        candidates: result.candidates,
        needsReview: result.needsReview,
        source: 'computed',
      };
    }
    
    return {
      eventId: id,
      candidates: [],
      source: 'none',
      message: 'No transcript available to compute candidates',
    };
  });
  
  // POST /api/events/:id/resolve - Resolve ambiguity and trigger reprocess
  server.post<{ Params: { id: string } }>('/:id/resolve', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as ResolveEventBody;
    
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | { id: string; status: string; transcript: string | null }
      | undefined;
    
    if (!event) {
      reply.status(404);
      return { error: 'Event not found' };
    }
    
    // Can only resolve events in needs_review status
    if (event.status !== 'needs_review') {
      reply.status(400);
      return { error: `Cannot resolve event with status '${event.status}'. Only 'needs_review' events can be resolved.` };
    }
    
    // Validate epicId if provided
    if (body.epicId !== null && body.epicId !== undefined) {
      const epic = findEpicById(body.epicId);
      if (!epic) {
        reply.status(404);
        return { error: 'Epic not found' };
      }
    }
    
    // Cancel any pending extract jobs for this event
    db.prepare(`
      UPDATE jobs 
      SET status = 'failed',
          error_message = 'Cancelled: resolved manually',
          updated_at = datetime('now')
      WHERE event_id = ? 
        AND type = 'extract'
        AND status IN ('pending', 'retry')
    `).run(id);
    
    // Update event status to processing
    db.prepare(`
      UPDATE events 
      SET status = 'processing',
          status_reason = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(body.epicId || 'no_epic', id);
    
    // Enqueue reprocess job with forced epic context
    const job = enqueue(id, 'reprocess', {
      epicId: body.epicId || null,
      transcript: event.transcript,
    });
    
    console.log(`[Events] Resolved event ${id} with epic ${body.epicId || 'none'}, enqueued reprocess job ${job.id}`);
    
    return {
      eventId: id,
      jobId: job.id,
      status: 'processing',
      epicId: body.epicId || null,
    };
  });
  
  // POST /api/events/:id/retry - Retry a failed event
  server.post<{ Params: { id: string } }>('/:id/retry', async (request, reply) => {
    const { id } = request.params;
    
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as
      | { id: string; status: string; transcript: string | null; audio_path: string | null }
      | undefined;
    
    if (!event) {
      reply.status(404);
      return { error: 'Event not found' };
    }
    
    // Can only retry events in failed status
    if (event.status !== 'failed') {
      reply.status(400);
      return { error: `Cannot retry event with status '${event.status}'. Only 'failed' events can be retried.` };
    }
    
    // Clear any existing failed jobs for this event
    db.prepare(`
      DELETE FROM jobs 
      WHERE event_id = ? 
        AND status = 'failed'
    `).run(id);
    
    let job;
    
    // If has transcript, re-enqueue extract job
    if (event.transcript) {
      db.prepare(`
        UPDATE events 
        SET status = 'transcribed',
            status_reason = 'Retried',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(id);
      
      job = enqueue(id, 'extract', { transcript: event.transcript });
      console.log(`[Events] Retried event ${id} with extract job ${job.id}`);
    } 
    // If has audio but no transcript, re-enqueue STT job
    else if (event.audio_path) {
      db.prepare(`
        UPDATE events 
        SET status = 'queued',
            status_reason = 'Retried',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(id);
      
      job = enqueue(id, 'stt', { audioPath: event.audio_path, language: 'es' });
      console.log(`[Events] Retried event ${id} with STT job ${job.id}`);
    } else {
      reply.status(400);
      return { error: 'Event has no transcript or audio to retry' };
    }
    
    return {
      eventId: id,
      jobId: job.id,
      status: event.transcript ? 'transcribed' : 'queued',
    };
  });
  
  // POST /api/events/:id/match-epics - Test endpoint for epic matching (for debugging)
  server.post<{ Params: { id: string } }>('/:id/match-epics', async (request, reply) => {
    const { id } = request.params;
    
    const event = db.prepare('SELECT transcript FROM events WHERE id = ?').get(id) as
      | { transcript: string | null }
      | undefined;
    
    if (!event) {
      reply.status(404);
      return { error: 'Event not found' };
    }
    
    if (!event.transcript) {
      reply.status(400);
      return { error: 'Event has no transcript' };
    }
    
    // Run epic matching
    const result = findEpicCandidates(event.transcript);
    
    // Store candidates
    storeEpicCandidates(id, result.candidates);
    
    return {
      eventId: id,
      transcript: event.transcript.substring(0, 100) + '...',
      candidates: result.candidates,
      needsReview: result.needsReview,
      topConfidence: result.topConfidence,
      confidenceGap: result.confidenceGap,
    };
  });
}
