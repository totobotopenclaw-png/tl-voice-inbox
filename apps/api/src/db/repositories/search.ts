import { db } from '../connection.js';
import type { SearchResult, KnowledgeItem } from '@tl-voice-inbox/shared';

interface FtsRow {
  content_type: string;
  content_id: string;
  title: string;
  content: string;
  created_at?: string;
  status?: string;
  epic_id?: string;
}

/**
 * Search knowledge items specifically
 * Used for building LLM context
 */
export function searchKnowledge(query: string, limit: number = 5): Array<{ id: string; title: string; type: string; content: string }> {
  // Escape FTS5 special characters: " [ ] ( ) * ^ { } : - , . / etc
  const sanitizedQuery = query
    .replace(/"/g, '""')  // Escape double quotes
    .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ')  // Replace special chars with space
    .trim();

  if (!sanitizedQuery) {
    return [];
  }

  const stmt = db.prepare(`
    SELECT 
      s.content_id as id,
      s.title,
      s.content_type as type,
      s.content,
      bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank
    FROM search_fts s
    WHERE s.content_type = 'knowledge' AND search_fts MATCH ?
    ORDER BY rank ASC
    LIMIT ?
  `);

  const rows = stmt.all(sanitizedQuery, limit) as Array<{
    id: string;
    title: string;
    type: string;
    content: string;
    rank: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
  }));
}

interface FtsMatchRow extends FtsRow {
  rank: number;
}

export const searchRepository = {
  /**
   * Search knowledge items specifically
   * Used for building LLM context
   */
  searchKnowledge(query: string, limit: number = 5): Array<{ id: string; title: string; type: string; content: string }> {
    // Escape FTS5 special characters: " [ ] ( ) * ^ { } : - , . / etc
    const sanitizedQuery = query
      .replace(/"/g, '""')  // Escape double quotes
      .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ')  // Replace special chars with space
      .trim();

    if (!sanitizedQuery) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT 
        s.content_id as id,
        s.title,
        s.content_type as type,
        s.content,
        bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank
      FROM search_fts s
      WHERE s.content_type = 'knowledge' AND search_fts MATCH ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    const rows = stmt.all(sanitizedQuery, limit) as Array<{
      id: string;
      title: string;
      type: string;
      content: string;
      rank: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      content: row.content,
    }));
  },

  /**
   * Search using FTS5 with BM25 ranking
   * BM25: best matching 25 - standard ranking function for text search
   * Lower rank = better match
   */
  search(query: string, limit: number = 20): Array<SearchResult & { status?: string; epic_id?: string }> {
    // Sanitize query for FTS5 MATCH (escape special characters)
    const sanitizedQuery = query
      .replace(/"/g, '""') // Escape quotes
      .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ') // Replace FTS5 special chars with space
      .trim();

    if (!sanitizedQuery) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT 
        s.content_type,
        s.content_id,
        s.title,
        s.content,
        e.created_at,
        e.status,
        e.epic_id,
        bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank
      FROM search_fts s
      LEFT JOIN (
        SELECT id as content_id, created_at, NULL as status, epic_id FROM actions
        UNION ALL
        SELECT id, created_at, NULL as status, epic_id FROM knowledge_items
        UNION ALL
        SELECT id, created_at, NULL as status, NULL as epic_id FROM epics
      ) e ON s.content_id = e.content_id
      WHERE search_fts MATCH ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    const rows = stmt.all(sanitizedQuery, limit) as Array<FtsMatchRow & { status: string | null; epic_id: string | null }>;

    return rows.map((row) => ({
      id: row.content_id,
      type: row.content_type as SearchResult['type'],
      title: row.title,
      content: row.content.slice(0, 500), // Limit content length
      rank: row.rank,
      created_at: row.created_at || new Date().toISOString(),
      status: row.status || undefined,
      epic_id: row.epic_id || undefined,
    }));
  },

  /**
   * Search within a specific epic
   */
  searchByEpic(query: string, epicId: string, limit: number = 20): Array<SearchResult & { status?: string; epic_id?: string }> {
    const sanitizedQuery = query
      .replace(/"/g, '""')
      .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ')
      .trim();

    if (!sanitizedQuery) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT 
        s.content_type,
        s.content_id,
        s.title,
        s.content,
        e.created_at,
        CASE 
          WHEN s.content_type = 'action' THEN 
            CASE WHEN a.completed_at IS NULL THEN 'pending' ELSE 'completed' END
          ELSE NULL
        END as status,
        e.epic_id,
        bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank
      FROM search_fts s
      LEFT JOIN (
        SELECT id as content_id, created_at, epic_id FROM actions
        UNION ALL
        SELECT id, created_at, epic_id FROM knowledge_items
      ) e ON s.content_id = e.content_id
      LEFT JOIN actions a ON s.content_id = a.id AND s.content_type = 'action'
      WHERE search_fts MATCH ?
        AND e.epic_id = ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    const rows = stmt.all(sanitizedQuery, epicId, limit) as Array<FtsMatchRow & { status: string | null; epic_id: string | null }>;

    return rows.map((row) => ({
      id: row.content_id,
      type: row.content_type as SearchResult['type'],
      title: row.title,
      content: row.content.slice(0, 500),
      rank: row.rank,
      created_at: row.created_at || new Date().toISOString(),
      status: row.status || undefined,
      epic_id: row.epic_id || undefined,
    }));
  },

  /**
   * Full-text search with snippet highlighting
   */
  searchWithSnippets(query: string, limit: number = 20): Array<SearchResult & { snippet: string }> {
    const sanitizedQuery = query
      .replace(/"/g, '""')
      .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ')
      .trim();

    if (!sanitizedQuery) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT 
        s.content_type,
        s.content_id,
        s.title,
        s.content,
        e.created_at,
        bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank,
        snippet(search_fts, 3, '«', '»', '...', 32) as snippet
      FROM search_fts s
      LEFT JOIN (
        SELECT id as content_id, created_at FROM actions
        UNION ALL
        SELECT id, created_at FROM knowledge_items
        UNION ALL
        SELECT id, created_at FROM epics
      ) e ON s.content_id = e.content_id
      WHERE search_fts MATCH ?
      ORDER BY rank ASC
      LIMIT ?
    `);

    const rows = stmt.all(sanitizedQuery, limit) as Array<FtsMatchRow & { snippet: string }>;

    return rows.map((row) => ({
      id: row.content_id,
      type: row.content_type as SearchResult['type'],
      title: row.title,
      content: row.content.slice(0, 500),
      rank: row.rank,
      created_at: row.created_at || new Date().toISOString(),
      snippet: row.snippet,
    }));
  },

  /**
   * Rebuild the FTS5 index from scratch
   * Useful after schema changes or bulk imports
   */
  rebuildIndex(): void {
    console.log('Rebuilding FTS5 index...');

    // Clear existing index
    db.exec('DELETE FROM search_fts');

    // Rebuild from actions
    db.exec(`
      INSERT INTO search_fts (content_type, content_id, title, content)
      SELECT 'action', id, title, COALESCE(body, '') FROM actions
    `);

    // Rebuild from knowledge items
    db.exec(`
      INSERT INTO search_fts (content_type, content_id, title, content)
      SELECT 'knowledge', id, title, body_md FROM knowledge_items
    `);

    // Rebuild from epics
    db.exec(`
      INSERT INTO search_fts (content_type, content_id, title, content)
      SELECT 'epic', id, title, COALESCE(description, '') FROM epics
    `);

    console.log('FTS5 index rebuilt');
  },

  /**
   * Get search statistics
   */
  getStats(): { totalDocuments: number; actions: number; knowledge: number; epics: number } {
    const total = db.prepare('SELECT COUNT(*) as count FROM search_fts').get() as { count: number };
    const actions = db.prepare("SELECT COUNT(*) as count FROM search_fts WHERE content_type = 'action'").get() as { count: number };
    const knowledge = db.prepare("SELECT COUNT(*) as count FROM search_fts WHERE content_type = 'knowledge'").get() as { count: number };
    const epics = db.prepare("SELECT COUNT(*) as count FROM search_fts WHERE content_type = 'epic'").get() as { count: number };

    return {
      totalDocuments: total.count,
      actions: actions.count,
      knowledge: knowledge.count,
      epics: epics.count,
    };
  },
};
