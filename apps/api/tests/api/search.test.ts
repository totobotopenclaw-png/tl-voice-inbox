import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { searchRoutes } from '../../src/routes/search';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Search API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(searchRoutes, { prefix: '/api' });
  });

  afterEach(() => {
    clearTables(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  describe('GET /api/search', () => {
    it('should return 400 when query is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/search',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('Missing required query parameter');
    });

    it('should return 400 when query is empty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('Missing required query parameter');
    });

    it('should search and return results', async () => {
      // Setup: create event, epic, and action that will be indexed
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description about testing', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, epic_id, type, title, body, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'epic-1', 'follow_up', 'Action about testing', 'Test body content', 'P1', datetime('now'), datetime('now'))
      `).run();

      // Note: In real scenario, FTS triggers would populate search_fts
      // For testing, we manually insert into search_fts
      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES 
          ('action', 'action-1', 'Action about testing', 'Test body content'),
          ('epic', 'epic-1', 'Test Epic', 'Description about testing')
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=testing',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.query).toBe('testing');
      expect(body.count).toBeGreaterThan(0);
      expect(body.results).toBeInstanceOf(Array);
    });

    it('should filter by type', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Search Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Search Test Action', 'P1', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES 
          ('action', 'action-1', 'Search Test Action', ''),
          ('epic', 'epic-1', 'Search Test Epic', '')
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=Search&type=action',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.results.every((r: { type: string }) => r.type === 'action')).toBe(true);
    });

    it('should apply limit parameter', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      // Add multiple results
      const stmt = db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES (?, 'event-1', 'follow_up', ?, 'P1', datetime('now'), datetime('now'))
      `);

      for (let i = 1; i <= 5; i++) {
        stmt.run(`action-${i}`, `Test Action ${i}`);
        db.prepare(`
          INSERT INTO search_fts (content_type, content_id, title, content)
          VALUES ('action', ?, ?, '')
        `).run(`action-${i}`, `Test Action ${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=Test&limit=2',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.results.length).toBeLessThanOrEqual(2);
    });

    it('should cap limit at 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=200',
      });

      // Should not error, just cap the limit
      expect(response.statusCode).toBe(200);
    });

    it('should handle search by epic', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, epic_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'epic-1', 'follow_up', 'Epic Action', 'P1', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('action', 'action-1', 'Epic Action', '')
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=Action&epic=epic-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.filters.epic).toBe('epic-1');
    });
  });

  describe('POST /api/search/index', () => {
    it('should rebuild search index', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, body, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Test Action', 'Body', 'P1', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/search/index',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('index rebuilt');

      // Verify index was rebuilt by checking stats
      const stats = db.prepare('SELECT COUNT(*) as count FROM search_fts').get() as { count: number };
      expect(stats.count).toBeGreaterThan(0);
    });
  });
});
