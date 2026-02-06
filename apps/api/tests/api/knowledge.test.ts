import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { knowledgeRoutes } from '../../src/routes/knowledge';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Knowledge API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(knowledgeRoutes, { prefix: '/api/knowledge' });
  });

  afterEach(() => {
    clearTables(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  describe('GET /api/knowledge', () => {
    it('should return empty array when no items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toEqual([]);
    });

    it('should list all knowledge items with epic titles', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, epic_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'epic-1', 'Test Knowledge', 'tech', '["test","example"]', '# Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        id: 'knowledge-1',
        title: 'Test Knowledge',
        kind: 'tech',
        tags: ['test', 'example'],
        bodyMd: '# Content',
        epicTitle: 'Test Epic',
      });
    });

    it('should filter by kind', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES 
          ('knowledge-1', 'event-1', 'Tech Doc', 'tech', '[]', 'Content', datetime('now'), datetime('now')),
          ('knowledge-2', 'event-1', 'Process Doc', 'process', '[]', 'Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge?kind=tech',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].kind).toBe('tech');
    });

    it('should filter by epicId', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES 
          ('epic-1', 'Epic 1', 'active', datetime('now'), datetime('now')),
          ('epic-2', 'Epic 2', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, epic_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES 
          ('knowledge-1', 'event-1', 'epic-1', 'Knowledge 1', 'tech', '[]', 'Content', datetime('now'), datetime('now')),
          ('knowledge-2', 'event-1', 'epic-2', 'Knowledge 2', 'tech', '[]', 'Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge?epicId=epic-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].title).toBe('Knowledge 1');
    });

    it('should filter by search term', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES 
          ('knowledge-1', 'event-1', 'Alpha Document', 'tech', '[]', 'Content about alpha', datetime('now'), datetime('now')),
          ('knowledge-2', 'event-1', 'Beta Document', 'tech', '[]', 'Content about beta', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge?search=alpha',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].title).toBe('Alpha Document');
    });

    it('should respect limit and offset', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const stmt = db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES (?, 'event-1', ?, 'tech', '[]', 'Content', datetime('now'), datetime('now'))
      `);

      for (let i = 1; i <= 5; i++) {
        stmt.run(`knowledge-${i}`, `Knowledge ${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge?limit=2&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.items).toHaveLength(2);
    });
  });

  describe('GET /api/knowledge/:id', () => {
    it('should return knowledge item details', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, epic_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'epic-1', 'Test Knowledge', 'tech', '["tag1","tag2"]', '# Heading', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge/knowledge-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.item).toMatchObject({
        id: 'knowledge-1',
        title: 'Test Knowledge',
        kind: 'tech',
        tags: ['tag1', 'tag2'],
        bodyMd: '# Heading',
        epicTitle: 'Test Epic',
      });
    });

    it('should return 404 for non-existent item', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/knowledge/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Knowledge item not found');
    });
  });

  describe('POST /api/knowledge', () => {
    it('should create a new knowledge item', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/knowledge',
        payload: {
          sourceEventId: 'event-1',
          title: 'New Knowledge',
          kind: 'process',
          tags: ['tag1', 'tag2'],
          bodyMd: '# Markdown Content',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('New Knowledge');
      expect(body.kind).toBe('process');
    });

    it('should return 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/knowledge',
        payload: {
          sourceEventId: 'event-1',
          kind: 'tech',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Title is required');
    });

    it('should return 400 when sourceEventId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/knowledge',
        payload: {
          title: 'Test Knowledge',
          kind: 'tech',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('sourceEventId is required');
    });

    it('should use defaults for optional fields', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/knowledge',
        payload: {
          sourceEventId: 'event-1',
          title: 'Minimal Knowledge',
          bodyMd: 'Content',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.kind).toBe('tech');
    });

    it('should allow all valid kinds', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const kinds = ['tech', 'process', 'decision'];

      for (const kind of kinds) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/knowledge',
          payload: {
            sourceEventId: 'event-1',
            title: `${kind} Knowledge`,
            kind,
            bodyMd: 'Content',
          },
        });

        expect(response.statusCode).toBe(201);
        expect(JSON.parse(response.payload).kind).toBe(kind);
      }
    });
  });

  describe('PATCH /api/knowledge/:id', () => {
    it('should update knowledge item fields', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Original Title', 'tech', '["old"]', 'Old content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/knowledge/knowledge-1',
        payload: {
          title: 'Updated Title',
          kind: 'process',
          tags: ['new1', 'new2'],
          bodyMd: 'Updated content',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.item.title).toBe('Updated Title');
      expect(body.item.kind).toBe('process');
    });

    it('should return 404 for non-existent item', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/knowledge/non-existent',
        payload: {
          title: 'Updated',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).error).toBe('Knowledge item not found');
    });

    it('should return 400 when no fields provided', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Title', 'tech', '[]', 'Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/knowledge/knowledge-1',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toBe('No fields to update');
    });

    it('should update epic association', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Title', 'tech', '[]', 'Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/knowledge/knowledge-1',
        payload: {
          epicId: 'epic-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.item.epic_id).toBe('epic-1');
    });
  });

  describe('DELETE /api/knowledge/:id', () => {
    it('should delete a knowledge item', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'To Delete', 'tech', '[]', 'Content', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/knowledge/knowledge-1',
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get('knowledge-1');
      expect(item).toBeUndefined();
    });

    it('should return 404 for non-existent item', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/knowledge/non-existent',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).error).toBe('Knowledge item not found');
    });
  });
});
