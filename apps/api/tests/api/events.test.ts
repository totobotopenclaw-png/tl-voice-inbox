import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { eventsRoutes } from '../../src/routes/events';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import { createMockEvent, createMockEpic, createMockAudioBuffer } from '../mocks/generators';
import * as queueManager from '../../src/queue/manager';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null, // Will be set in beforeAll
}));

// Mock queue manager
vi.mock('../../src/queue/manager', () => ({
  enqueue: vi.fn().mockReturnValue({ id: 'test-job-id', type: 'stt' }),
}));

describe('Events API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
    await app.register(eventsRoutes, { prefix: '/api/events' });
  });

 afterEach(() => {
    clearTables(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  describe('POST /api/events', () => {
    it('should create an event from audio upload', async () => {
      const audioBuffer = createMockAudioBuffer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: audioBuffer,
        headers: {
          'content-type': 'audio/webm',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('eventId');
      expect(body).toHaveProperty('jobId');
      expect(body.status).toBe('queued');
      expect(queueManager.enqueue).toHaveBeenCalled();
    });

    it('should handle missing audio file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('No audio file provided');
    });
  });

  describe('POST /api/events/test', () => {
    it('should create a test event with transcript', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/test',
        payload: {
          title: 'Test Event',
          rawTranscript: 'This is a test transcript',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('eventId');
      expect(body.status).toBe('transcribed');
      expect(queueManager.enqueue).toHaveBeenCalled();
    });

    it('should use title as fallback when rawTranscript not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/test',
        payload: {
          title: 'Fallback Title',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(queueManager.enqueue).toHaveBeenCalled();
    });
  });

  describe('GET /api/events', () => {
    it('should list events', async () => {
      // Create test events
      const stmt = db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES (?, ?, 'queued', datetime('now'), datetime('now'))
      `);
      stmt.run('event-1', '/path/1');
      stmt.run('event-2', '/path/2');

      const response = await app.inject({
        method: 'GET',
        url: '/api/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.events).toHaveLength(2);
      expect(body.events[0]).toHaveProperty('id');
      expect(body.events[0]).toHaveProperty('status');
    });

    it('should filter by status', async () => {
      const stmt = db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);
      stmt.run('event-1', '/path/1', 'queued');
      stmt.run('event-2', '/path/2', 'completed');

      const response = await app.inject({
        method: 'GET',
        url: '/api/events?status=queued',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].id).toBe('event-1');
    });

    it('should respect limit and offset', async () => {
      const stmt = db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES (?, ?, 'queued', datetime('now'), datetime('now'))
      `);
      for (let i = 1; i <= 5; i++) {
        stmt.run(`event-${i}`, `/path/${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/events?limit=2&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.events).toHaveLength(2);
    });

    it('should return empty array when no events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.events).toEqual([]);
    });
  });

  describe('GET /api/events/:id', () => {
    it('should return event details', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('test-event', '/path/audio.webm', 'transcribed', 'Test transcript', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/events/test-event',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.event.id).toBe('test-event');
      expect(body.event.transcript).toBe('Test transcript');
      expect(body).toHaveProperty('jobs');
      expect(body).toHaveProperty('candidates');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/events/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Event not found');
    });

    it('should include candidates for needs_review status', async () => {
      // Create epic and event
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-review', '/path/audio.webm', 'needs_review', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO event_epic_candidates (id, event_id, epic_id, score, rank, created_at, updated_at)
        VALUES ('candidate-1', 'event-review', 'epic-1', 0.8, 1, datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/events/event-review',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.candidates).toBeTruthy();
    });
  });

  describe('GET /api/events/:id/candidates', () => {
    it('should return stored candidates', async () => {
      // Setup
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'transcribed', 'Test transcript', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO event_epic_candidates (id, event_id, epic_id, score, rank, created_at, updated_at)
        VALUES ('candidate-1', 'event-1', 'epic-1', 0.8, 1, datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/events/event-1/candidates',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.candidates).toHaveLength(1);
      expect(body.source).toBe('stored');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/events/non-existent/candidates',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should compute candidates on the fly if no stored candidates', async () => {
      // Create epic and event with transcript
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'transcribed', 'Test Epic related content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/events/event-1/candidates',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.source).toBe('computed');
    });
  });

  describe('POST /api/events/:id/resolve', () => {
    it('should resolve event with epic', async () => {
      // Setup
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'needs_review', 'Test transcript', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/resolve',
        payload: {
          epicId: 'epic-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('processing');
      expect(body.epicId).toBe('epic-1');
      expect(queueManager.enqueue).toHaveBeenCalled();
    });

    it('should resolve event without epic', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'needs_review', 'Test transcript', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/resolve',
        payload: {
          epicId: null,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.epicId).toBeNull();
    });

    it('should return 404 for non-existent event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/non-existent/resolve',
        payload: { epicId: 'epic-1' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 if event not in needs_review status', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'queued', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/resolve',
        payload: { epicId: 'epic-1' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('needs_review');
    });

    it('should return 404 for non-existent epic', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'needs_review', 'Test transcript', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/resolve',
        payload: { epicId: 'non-existent-epic' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/events/:id/match-epics', () => {
    it('should match epics and store candidates', async () => {
      // Setup
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO events (id, audio_path, status, transcript, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'transcribed', 'Test Epic content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/match-epics',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('candidates');
      expect(body).toHaveProperty('needsReview');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events/non-existent/match-epics',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 if event has no transcript', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/audio.webm', 'queued', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/events/event-1/match-epics',
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toBe('Event has no transcript');
    });
  });
});