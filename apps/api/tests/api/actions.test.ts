import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { actionsRoutes } from '../../src/routes/actions';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Actions API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(actionsRoutes, { prefix: '/api/actions' });
  });

  afterEach(() => {
    clearTables(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  describe('GET /api/actions', () => {
    it('should return empty array when no actions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/actions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toEqual([]);
    });

    it('should list all actions with epic titles and mentions', async () => {
      // Setup: create event, epic, and action
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, epic_id, type, title, body, priority, due_at, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'epic-1', 'follow_up', 'Test Action', 'Body', 'P1', datetime('now'), datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO mentions (id, action_id, name, created_at, updated_at)
        VALUES ('mention-1', 'action-1', 'Alice', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0]).toMatchObject({
        id: 'action-1',
        title: 'Test Action',
        type: 'follow_up',
        priority: 'P1',
        status: 'open',
        epicTitle: 'Test Epic',
        mentions: ['Alice'],
      });
    });

    it('should filter by status', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, completed_at, created_at, updated_at)
        VALUES 
          ('action-1', 'event-1', 'follow_up', 'Open Action', 'P1', NULL, datetime('now'), datetime('now')),
          ('action-2', 'event-1', 'follow_up', 'Done Action', 'P2', datetime('now'), datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions?status=open',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0].title).toBe('Open Action');
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
        INSERT INTO actions (id, source_event_id, epic_id, type, title, priority, created_at, updated_at)
        VALUES 
          ('action-1', 'event-1', 'epic-1', 'follow_up', 'Action 1', 'P1', datetime('now'), datetime('now')),
          ('action-2', 'event-1', 'epic-2', 'follow_up', 'Action 2', 'P2', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions?epicId=epic-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0].title).toBe('Action 1');
    });

    it('should filter by type', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES 
          ('action-1', 'event-1', 'follow_up', 'Follow Up', 'P1', datetime('now'), datetime('now')),
          ('action-2', 'event-1', 'deadline', 'Deadline', 'P2', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions?type=deadline',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0].type).toBe('deadline');
    });

    it('should filter by hasDueDate', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, due_at, created_at, updated_at)
        VALUES 
          ('action-1', 'event-1', 'follow_up', 'With Due', 'P1', datetime('now'), datetime('now'), datetime('now')),
          ('action-2', 'event-1', 'follow_up', 'No Due', 'P2', NULL, datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions?hasDueDate=true',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(1);
      expect(body.actions[0].title).toBe('With Due');
    });

    it('should respect limit and offset', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const stmt = db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES (?, 'event-1', 'follow_up', ?, 'P1', datetime('now'), datetime('now'))
      `);

      for (let i = 1; i <= 5; i++) {
        stmt.run(`action-${i}`, `Action ${i}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions?limit=2&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.actions).toHaveLength(2);
    });
  });

  describe('GET /api/actions/:id', () => {
    it('should return action details', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, epic_id, type, title, body, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'epic-1', 'follow_up', 'Test Action', 'Body text', 'P1', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/actions/action-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.action).toMatchObject({
        id: 'action-1',
        title: 'Test Action',
        body: 'Body text',
        type: 'follow_up',
        priority: 'P1',
        epicTitle: 'Test Epic',
      });
    });

    it('should return 404 for non-existent action', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/actions/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Action not found');
    });
  });

  describe('POST /api/actions', () => {
    it('should create a new action', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: {
          sourceEventId: 'event-1',
          title: 'New Action',
          type: 'follow_up',
          priority: 'P0',
          body: 'Action body',
          mentions: ['Alice', 'Bob'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('New Action');
      expect(body.type).toBe('follow_up');
      expect(body.priority).toBe('P0');

      // Verify mentions were created
      const mentions = db.prepare('SELECT * FROM mentions WHERE action_id = ?').all(body.id);
      expect(mentions).toHaveLength(2);
    });

    it('should return 400 when title is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: {
          sourceEventId: 'event-1',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Title is required');
    });

    it('should return 400 when sourceEventId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/actions',
        payload: {
          title: 'Test Action',
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
        url: '/api/actions',
        payload: {
          sourceEventId: 'event-1',
          title: 'Minimal Action',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.type).toBe('follow_up');
      expect(body.priority).toBe('P2');
    });
  });

  describe('PATCH /api/actions/:id', () => {
    it('should update action fields', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Original Title', 'P2', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/actions/action-1',
        payload: {
          title: 'Updated Title',
          priority: 'P0',
          status: 'done',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.action.title).toBe('Updated Title');
      expect(body.action.priority).toBe('P0');
      expect(body.action.completedAt).not.toBeNull();
    });

    it('should return 404 for non-existent action', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/actions/non-existent',
        payload: {
          title: 'Updated',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).error).toBe('Action not found');
    });

    it('should return 400 when no fields provided', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Title', 'P2', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/actions/action-1',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toBe('No fields to update');
    });

    it('should allow reopening a completed action', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, completed_at, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Title', datetime('now'), datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/actions/action-1',
        payload: {
          status: 'open',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.action.completedAt).toBeNull();
    });
  });

  describe('DELETE /api/actions/:id', () => {
    it('should delete an action', async () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'To Delete', 'P2', datetime('now'), datetime('now'))
      `).run();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/actions/action-1',
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const action = db.prepare('SELECT * FROM actions WHERE id = ?').get('action-1');
      expect(action).toBeUndefined();
    });

    it('should return 404 for non-existent action', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/actions/non-existent',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload).error).toBe('Action not found');
    });
  });
});
