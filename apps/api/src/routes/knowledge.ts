// Knowledge API routes
import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';

/**
 * Ensure the manual-entry sentinel event exists for manually created items.
 * knowledge_items has NOT NULL FK on source_event_id.
 */
function ensureManualSentinel(): void {
  const MANUAL_EVENT_ID = 'manual-entry-sentinel';
  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(MANUAL_EVENT_ID) as { id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO events (id, status, created_at, updated_at) VALUES (?, 'completed', datetime('now'), datetime('now'))`
    ).run(MANUAL_EVENT_ID);
  }
}

interface CreateKnowledgeBody {
  sourceEventId: string;
  epicId?: string;
  title: string;
  kind: 'tech' | 'process' | 'decision';
  tags?: string[];
  bodyMd: string;
}

interface UpdateKnowledgeBody {
  title?: string;
  kind?: 'tech' | 'process' | 'decision';
  tags?: string[];
  bodyMd?: string;
  epicId?: string | null;
}

export async function knowledgeRoutes(server: FastifyInstance): Promise<void> {
  
  // GET /api/knowledge - List all knowledge items
  server.get('/', async (request) => {
    const { 
      kind, 
      epicId, 
      search,
      limit = '50', 
      offset = '0' 
    } = request.query as {
      kind?: string;
      epicId?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
    
    let query = `
      SELECT 
        k.*,
        e.title as epic_title
      FROM knowledge_items k
      LEFT JOIN epics e ON k.epic_id = e.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    
    if (kind) {
      query += ' AND k.kind = ?';
      params.push(kind);
    }
    
    if (epicId) {
      query += ' AND k.epic_id = ?';
      params.push(epicId);
    }
    
    if (search) {
      query += ' AND (k.title LIKE ? OR k.body_md LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY k.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    
    const rows = db.prepare(query).all(...params) as Array<{
      id: string;
      source_event_id: string;
      epic_id: string | null;
      title: string;
      kind: string;
      tags: string;
      body_md: string;
      created_at: string;
      updated_at: string;
      epic_title: string | null;
    }>;
    
    return {
      items: rows.map(row => ({
        id: row.id,
        sourceEventId: row.source_event_id,
        epicId: row.epic_id,
        title: row.title,
        kind: row.kind as 'tech' | 'process' | 'decision',
        tags: JSON.parse(row.tags || '[]'),
        bodyMd: row.body_md,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        epicTitle: row.epic_title,
      })),
    };
  });

  // GET /api/knowledge/:id - Get single knowledge item
  server.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const row = db.prepare(`
      SELECT 
        k.*,
        e.title as epic_title
      FROM knowledge_items k
      LEFT JOIN epics e ON k.epic_id = e.id
      WHERE k.id = ?
    `).get(id) as {
      id: string;
      source_event_id: string;
      epic_id: string | null;
      title: string;
      kind: string;
      tags: string;
      body_md: string;
      created_at: string;
      updated_at: string;
      epic_title: string | null;
    } | undefined;
    
    if (!row) {
      reply.status(404);
      return { error: 'Knowledge item not found' };
    }
    
    return {
      item: {
        id: row.id,
        sourceEventId: row.source_event_id,
        epicId: row.epic_id,
        title: row.title,
        kind: row.kind as 'tech' | 'process' | 'decision',
        tags: JSON.parse(row.tags || '[]'),
        bodyMd: row.body_md,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        epicTitle: row.epic_title,
      },
    };
  });

  // POST /api/knowledge - Create new knowledge item
  server.post('/', async (request, reply) => {
    const body = request.body as CreateKnowledgeBody;
    
    if (!body.title || body.title.trim().length === 0) {
      reply.status(400);
      return { error: 'Title is required' };
    }
    
    if (!body.sourceEventId) {
      reply.status(400);
      return { error: 'sourceEventId is required' };
    }

    // If using the manual sentinel, ensure it exists
    if (body.sourceEventId === 'manual-entry-sentinel') {
      ensureManualSentinel();
    }

    const knowledgeId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO knowledge_items (
        id, source_event_id, epic_id, title, kind, tags, body_md, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      knowledgeId,
      body.sourceEventId,
      body.epicId || null,
      body.title.trim(),
      body.kind || 'tech',
      JSON.stringify(body.tags || []),
      body.bodyMd || '',
      now,
      now
    );
    
    reply.status(201);
    return {
      id: knowledgeId,
      title: body.title,
      kind: body.kind || 'tech',
      createdAt: now,
    };
  });

  // PATCH /api/knowledge/:id - Update knowledge item
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as UpdateKnowledgeBody;
    
    const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
    if (!item) {
      reply.status(404);
      return { error: 'Knowledge item not found' };
    }
    
    const updates: string[] = [];
    const params: (string | null)[] = [];
    
    if (body.title !== undefined) {
      updates.push('title = ?');
      params.push(body.title.trim());
    }
    
    if (body.kind !== undefined) {
      updates.push('kind = ?');
      params.push(body.kind);
    }
    
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(body.tags));
    }
    
    if (body.bodyMd !== undefined) {
      updates.push('body_md = ?');
      params.push(body.bodyMd);
    }
    
    if (body.epicId !== undefined) {
      updates.push('epic_id = ?');
      params.push(body.epicId);
    }
    
    if (updates.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    db.prepare(`UPDATE knowledge_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updated = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
    return { item: updated };
  });

  // DELETE /api/knowledge/:id - Delete knowledge item
  server.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
    if (!item) {
      reply.status(404);
      return { error: 'Knowledge item not found' };
    }
    
    db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id);
    
    reply.status(204);
    return;
  });
}
