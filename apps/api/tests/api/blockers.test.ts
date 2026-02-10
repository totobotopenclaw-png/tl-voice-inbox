import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { blockersRoutes, dependenciesRoutes } from '../../src/routes/blockers';
import { createTestDb, clearTables, closeTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Blockers & Dependencies API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(blockersRoutes, { prefix: '/api/blockers' });
    await app.register(dependenciesRoutes, { prefix: '/api/dependencies' });
  });

  afterEach(() => {
    clearTables(db);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  // Helper: insert a sentinel event + epic
  function seedEpic(): { eventId: string; epicId: string } {
    db.prepare(`
      INSERT INTO events (id, audio_path, status, created_at, updated_at)
      VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
    `).run();

    db.prepare(`
      INSERT INTO epics (id, title, description, status, created_at, updated_at)
      VALUES ('epic-1', 'Test Epic', 'Desc', 'active', datetime('now'), datetime('now'))
    `).run();

    return { eventId: 'event-1', epicId: 'epic-1' };
  }

  // Helper: insert a blocker directly
  function seedBlocker(epicId: string, eventId: string, overrides: Record<string, unknown> = {}): string {
    const id = overrides.id as string || 'blocker-1';
    db.prepare(`
      INSERT INTO blockers (id, source_event_id, epic_id, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      eventId,
      epicId,
      overrides.description || 'Test blocker',
      overrides.status || 'open'
    );
    return id;
  }

  // Helper: insert a dependency directly
  function seedDependency(epicId: string, eventId: string, overrides: Record<string, unknown> = {}): string {
    const id = overrides.id as string || 'dep-1';
    db.prepare(`
      INSERT INTO dependencies (id, source_event_id, epic_id, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      eventId,
      epicId,
      overrides.description || 'Test dependency',
      overrides.status || 'open'
    );
    return id;
  }

  // ======= BLOCKERS =======

  describe('POST /api/blockers', () => {
    it('should create a blocker manually', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers',
        payload: {
          epicId,
          description: 'Waiting for design review',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker).toBeDefined();
      expect(body.blocker.description).toBe('Waiting for design review');
      expect(body.blocker.epic_id).toBe(epicId);
      expect(body.blocker.status).toBe('open');

      // Verify it was persisted in DB
      const row = db.prepare('SELECT * FROM blockers WHERE id = ?').get(body.blocker.id);
      expect(row).toBeDefined();
    });

    it('should create a blocker with owner and eta', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers',
        payload: {
          epicId,
          description: 'Blocked on infra team',
          owner: 'infra-team',
          eta: '2026-03-01',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker.owner).toBe('infra-team');
      expect(body.blocker.eta).toBe('2026-03-01');
    });

    it('should return 400 when epicId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers',
        payload: {
          description: 'No epic',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('required');
    });

    it('should return 400 when description is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers',
        payload: {
          epicId: 'epic-1',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('required');
    });

    it('should use the sentinel event so FK constraint passes', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers',
        payload: {
          epicId,
          description: 'Manual blocker',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker.source_event_id).toBe('manual-entry-sentinel');

      // Verify the sentinel event exists
      const sentinel = db.prepare('SELECT * FROM events WHERE id = ?').get('manual-entry-sentinel');
      expect(sentinel).toBeDefined();
    });
  });

  describe('PATCH /api/blockers/:id', () => {
    it('should resolve a blocker', async () => {
      const { epicId, eventId } = seedEpic();
      const blockerId = seedBlocker(epicId, eventId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/blockers/${blockerId}`,
        payload: { status: 'resolved' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker.status).toBe('resolved');
      expect(body.blocker.resolved_at).not.toBeNull();
    });

    it('should update owner and eta', async () => {
      const { epicId, eventId } = seedEpic();
      const blockerId = seedBlocker(epicId, eventId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/blockers/${blockerId}`,
        payload: { owner: 'alice', eta: '2026-04-01' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker.owner).toBe('alice');
      expect(body.blocker.eta).toBe('2026-04-01');
    });

    it('should return 404 for non-existent blocker', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/blockers/non-existent',
        payload: { status: 'resolved' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/blockers/:id/snooze', () => {
    it('should snooze a blocker', async () => {
      const { epicId, eventId } = seedEpic();
      const blockerId = seedBlocker(epicId, eventId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/blockers/${blockerId}/snooze`,
        payload: { until: '2026-03-15' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.blocker.next_follow_up_at).toBe('2026-03-15');
    });

    it('should return 400 when until is missing', async () => {
      const { epicId, eventId } = seedEpic();
      const blockerId = seedBlocker(epicId, eventId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/blockers/${blockerId}/snooze`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent blocker', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/blockers/non-existent/snooze',
        payload: { until: '2026-03-15' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ======= DEPENDENCIES =======

  describe('POST /api/dependencies', () => {
    it('should create a dependency manually', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          epicId,
          description: 'Depends on auth service deploy',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.dependency).toBeDefined();
      expect(body.dependency.description).toBe('Depends on auth service deploy');
      expect(body.dependency.epic_id).toBe(epicId);
      expect(body.dependency.status).toBe('open');
    });

    it('should create a dependency with owner', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          epicId,
          description: 'Need API spec from backend team',
          owner: 'backend-team',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.dependency.owner).toBe('backend-team');
    });

    it('should return 400 when epicId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          description: 'No epic',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when description is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          epicId: 'epic-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should use the sentinel event for FK constraint', async () => {
      const { epicId } = seedEpic();

      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          epicId,
          description: 'Manual dependency',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.dependency.source_event_id).toBe('manual-entry-sentinel');
    });
  });

  describe('PATCH /api/dependencies/:id', () => {
    it('should resolve a dependency', async () => {
      const { epicId, eventId } = seedEpic();
      const depId = seedDependency(epicId, eventId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/dependencies/${depId}`,
        payload: { status: 'resolved' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.dependency.status).toBe('resolved');
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/dependencies/non-existent',
        payload: { status: 'resolved' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/dependencies/:id/snooze', () => {
    it('should snooze a dependency', async () => {
      const { epicId, eventId } = seedEpic();
      const depId = seedDependency(epicId, eventId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/dependencies/${depId}/snooze`,
        payload: { until: '2026-04-01' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.dependency.next_follow_up_at).toBe('2026-04-01');
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dependencies/non-existent/snooze',
        payload: { until: '2026-03-15' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
