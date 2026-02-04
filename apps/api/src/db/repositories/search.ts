import { db } from '../connection.js';
import type { SearchResult } from '@tl-voice-inbox/shared';

interface FtsRow {
  content_type: string;
  content_id: string;
  title: string;
  content: string;
  created_at?: string;
}

interface FtsMatchRow extends FtsRow {
  rank: number;
}

export const searchRepository = {
  /**
   * Search using FTS5 with BM25 ranking
   * BM25: best matching 25 - standard ranking function for text search
   * Lower rank = better match
   */
  search(query: string, limit: number = 20): SearchResult[] {
    // Sanitize query for FTS5 MATCH (escape special characters)
    const sanitizedQuery = query
      .replace(/"/g, '""') // Escape quotes
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
        bm25(search_fts, 1.0, 0.8, 1.2, 0.5) as rank
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

    const rows = stmt.all(sanitizedQuery, limit) as FtsMatchRow[];

    return rows.map((row) => ({
      id: row.content_id,
      type: row.content_type as SearchResult['type'],
      title: row.title,
      content: row.content.slice(0, 500), // Limit content length
      rank: row.rank,
      created_at: row.created_at || new Date().toISOString(),
    }));
  },

  /**
   * Full-text search with snippet highlighting
   */
  searchWithSnippets(query: string, limit: number = 20): Array<SearchResult & { snippet: string }> {
    const sanitizedQuery = query.replace(/"/g, '""').trim();

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
