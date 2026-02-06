import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';
import { searchRepository } from '../../src/db/repositories/search';

// Mock the db module  
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Search Repository', () => {
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;
  });

  beforeEach(() => {
    clearTables(db);
    // Clear search_fts as well
    db.prepare('DELETE FROM search_fts').run();
  });

  afterAll(() => {
    closeTestDb();
  });

  describe('search', () => {
    it('should return empty array for empty query', () => {
      const results = searchRepository.search('');
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace-only query', () => {
      const results = searchRepository.search('   ');
      expect(results).toEqual([]);
    });

    it('should search actions', () => {
      // Insert event first (foreign key requirement)
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      // Insert action
      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, body, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Test Action', 'Test body content', 'P1', datetime('now'), datetime('now'))
      `).run();

      // Insert into FTS index
      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('action', 'action-1', 'Test Action', 'Test body content')
      `).run();

      const results = searchRepository.search('Test');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('action');
      expect(results[0].title).toBe('Test Action');
    });

    it('should search knowledge items', () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Test Knowledge', 'tech', '[]', 'Knowledge content here', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('knowledge', 'knowledge-1', 'Test Knowledge', 'Knowledge content here')
      `).run();

      const results = searchRepository.search('Knowledge');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.type === 'knowledge')).toBe(true);
    });

    it('should search epics', () => {
      db.prepare(`
        INSERT INTO epics (id, title, description, status, created_at, updated_at)
        VALUES ('epic-1', 'Test Epic', 'Epic description', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('epic', 'epic-1', 'Test Epic', 'Epic description')
      `).run();

      const results = searchRepository.search('Epic');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.type === 'epic')).toBe(true);
    });

    it('should limit results', () => {
      // Insert event first
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      // Insert multiple results
      for (let i = 1; i <= 10; i++) {
        db.prepare(`
          INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
          VALUES (?, 'event-1', 'follow_up', ?, 'P1', datetime('now'), datetime('now'))
        `).run(`action-${i}`, `Test Action ${i}`);

        db.prepare(`
          INSERT INTO search_fts (content_type, content_id, title, content)
          VALUES ('action', ?, ?, '')
        `).run(`action-${i}`, `Test Action ${i}`);
      }

      const results = searchRepository.search('Test', 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should sanitize FTS5 special characters', () => {
      // Should not throw when query contains special characters
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Test Action', 'P1', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('action', 'action-1', 'Test Action', '')
      `).run();

      // These should not throw
      expect(() => searchRepository.search('test[bracket]')).not.toThrow();
      expect(() => searchRepository.search('test(paren)')).not.toThrow();
      expect(() => searchRepository.search('test*star')).not.toThrow();
      expect(() => searchRepository.search('test"quote')).not.toThrow();
    });
  });

  describe('searchByEpic', () => {
    it('should filter results by epic', () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      db.prepare(`
        INSERT INTO epics (id, title, status, created_at, updated_at)
        VALUES 
          ('epic-1', 'Epic One', 'active', datetime('now'), datetime('now')),
          ('epic-2', 'Epic Two', 'active', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO actions (id, source_event_id, epic_id, type, title, priority, created_at, updated_at)
        VALUES 
          ('action-1', 'event-1', 'epic-1', 'follow_up', 'Action One', 'P1', datetime('now'), datetime('now')),
          ('action-2', 'event-1', 'epic-2', 'follow_up', 'Action Two', 'P2', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES 
          ('action', 'action-1', 'Action One', ''),
          ('action', 'action-2', 'Action Two', '')
      `).run();

      const results = searchRepository.searchByEpic('Action', 'epic-1');
      expect(results.every(r => r.epic_id === 'epic-1')).toBe(true);
    });
  });

  describe('searchWithSnippets', () => {
    it('should return results with snippets', () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      db.prepare(`
        INSERT INTO actions (id, source_event_id, type, title, body, priority, created_at, updated_at)
        VALUES ('action-1', 'event-1', 'follow_up', 'Test Action', 'This is the test content body', 'P1', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('action', 'action-1', 'Test Action', 'This is the test content body')
      `).run();

      const results = searchRepository.searchWithSnippets('test');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('snippet');
    });
  });

  describe('searchKnowledge', () => {
    it('should search only knowledge items', () => {
      db.prepare(`
        INSERT INTO events (id, audio_path, status, created_at, updated_at)
        VALUES ('event-1', '/path/1', 'completed', datetime('now'), datetime('now'))
      `).run();
      
      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Test Knowledge', 'tech', '[]', 'Knowledge content', datetime('now'), datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('knowledge', 'knowledge-1', 'Test Knowledge', 'Knowledge content')
      `).run();

      const results = searchRepository.searchKnowledge('Knowledge');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.type === 'knowledge')).toBe(true);
    });
  });

  describe('rebuildIndex', () => {
    it('should rebuild FTS index from scratch', () => {
      // Insert data into source tables
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

      db.prepare(`
        INSERT INTO knowledge_items (id, source_event_id, title, kind, tags, body_md, created_at, updated_at)
        VALUES ('knowledge-1', 'event-1', 'Test Knowledge', 'tech', '[]', 'Body', datetime('now'), datetime('now'))
      `).run();

      searchRepository.rebuildIndex();

      const stats = searchRepository.getStats();
      expect(stats.totalDocuments).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return search statistics', () => {
      db.prepare(`
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES 
          ('action', 'a1', 'Action', ''),
          ('knowledge', 'k1', 'Knowledge', ''),
          ('epic', 'e1', 'Epic', '')
      `).run();

      const stats = searchRepository.getStats();
      expect(stats).toHaveProperty('totalDocuments');
      expect(stats).toHaveProperty('actions');
      expect(stats).toHaveProperty('knowledge');
      expect(stats).toHaveProperty('epics');
      expect(stats.totalDocuments).toBe(3);
      expect(stats.actions).toBe(1);
      expect(stats.knowledge).toBe(1);
      expect(stats.epics).toBe(1);
    });
  });
});
