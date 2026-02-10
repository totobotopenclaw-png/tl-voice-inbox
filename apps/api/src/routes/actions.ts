// Actions API routes
import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';

/**
 * Ensure the manual-entry sentinel event exists for manually created items.
 * actions has NOT NULL FK on source_event_id.
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

interface CreateActionBody {
  sourceEventId: string;
  epicId?: string;
  type: 'follow_up' | 'deadline' | 'email';
  title: string;
  body?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  dueAt?: string;
  mentions?: string[];
}

interface UpdateActionBody {
  title?: string;
  body?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  status?: 'open' | 'done' | 'cancelled';
  dueAt?: string | null;
  epicId?: string | null;
}

export async function actionsRoutes(server: FastifyInstance): Promise<void> {
  
  // GET /api/actions - List all actions
  server.get('/', async (request) => {
    const { 
      status, 
      epicId, 
      type,
      hasDueDate,
      limit = '50', 
      offset = '0' 
    } = request.query as {
      status?: string;
      epicId?: string;
      type?: string;
      hasDueDate?: string;
      limit?: string;
      offset?: string;
    };
    
    let query = `
      SELECT 
        a.*,
        e.title as epic_title,
        GROUP_CONCAT(m.name) as mention_names
      FROM actions a
      LEFT JOIN epics e ON a.epic_id = e.id
      LEFT JOIN mentions m ON m.action_id = a.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    
    if (status === 'open') {
      query += ' AND a.completed_at IS NULL';
    } else if (status === 'done') {
      query += ' AND a.completed_at IS NOT NULL';
    }
    
    if (epicId) {
      query += ' AND a.epic_id = ?';
      params.push(epicId);
    }
    
    if (type) {
      query += ' AND a.type = ?';
      params.push(type);
    }
    
    if (hasDueDate === 'true') {
      query += ' AND a.due_at IS NOT NULL';
    }
    
    query += ' GROUP BY a.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    
    const rows = db.prepare(query).all(...params) as Array<{
      id: string;
      source_event_id: string;
      epic_id: string | null;
      type: string;
      title: string;
      body: string | null;
      priority: string;
      due_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
      epic_title: string | null;
      mention_names: string | null;
    }>;
    
    return {
      actions: rows.map(row => ({
        id: row.id,
        sourceEventId: row.source_event_id,
        epicId: row.epic_id,
        type: row.type,
        title: row.title,
        body: row.body || '',
        priority: row.priority as 'P0' | 'P1' | 'P2' | 'P3',
        status: row.completed_at ? 'done' : 'open' as 'open' | 'done' | 'cancelled',
        dueAt: row.due_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        epicTitle: row.epic_title,
        mentions: row.mention_names ? row.mention_names.split(',') : [],
      })),
    };
  });

  // GET /api/actions/:id - Get single action
  server.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const row = db.prepare(`
      SELECT 
        a.*,
        e.title as epic_title,
        GROUP_CONCAT(m.name) as mention_names
      FROM actions a
      LEFT JOIN epics e ON a.epic_id = e.id
      LEFT JOIN mentions m ON m.action_id = a.id
      WHERE a.id = ?
      GROUP BY a.id
    `).get(id) as {
      id: string;
      source_event_id: string;
      epic_id: string | null;
      type: string;
      title: string;
      body: string | null;
      priority: string;
      due_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
      epic_title: string | null;
      mention_names: string | null;
    } | undefined;
    
    if (!row) {
      reply.status(404);
      return { error: 'Action not found' };
    }
    
    return {
      action: {
        id: row.id,
        sourceEventId: row.source_event_id,
        epicId: row.epic_id,
        type: row.type,
        title: row.title,
        body: row.body || '',
        priority: row.priority as 'P0' | 'P1' | 'P2' | 'P3',
        status: row.completed_at ? 'done' : 'open' as 'open' | 'done' | 'cancelled',
        dueAt: row.due_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        epicTitle: row.epic_title,
        mentions: row.mention_names ? row.mention_names.split(',') : [],
      },
    };
  });

  // POST /api/actions - Create new action
  server.post('/', async (request, reply) => {
    const body = request.body as CreateActionBody;
    
    if (!body.title || body.title.trim().length === 0) {
      reply.status(400);
      return { error: 'Title is required' };
    }
    
    if (!body.sourceEventId) {
      reply.status(400);
      return { error: 'sourceEventId is required' };
    }

    // If using manual sentinel, ensure the sentinel event exists
    let sourceEventId = body.sourceEventId;
    if (sourceEventId === 'manual-entry-sentinel' || sourceEventId.startsWith('manual-')) {
      ensureManualSentinel();
      sourceEventId = 'manual-entry-sentinel';
    }

    const actionId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO actions (
        id, source_event_id, epic_id, type, title, body,
        priority, due_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actionId,
      sourceEventId,
      body.epicId || null,
      body.type || 'follow_up',
      body.title.trim(),
      body.body || null,
      body.priority || 'P2',
      body.dueAt || null,
      now,
      now
    );
    
    // Add mentions if provided
    if (body.mentions && body.mentions.length > 0) {
      const mentionStmt = db.prepare(`
        INSERT INTO mentions (id, action_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const name of body.mentions) {
        mentionStmt.run(crypto.randomUUID(), actionId, name.trim(), now, now);
      }
    }
    
    reply.status(201);
    return {
      id: actionId,
      title: body.title,
      type: body.type || 'follow_up',
      priority: body.priority || 'P2',
      createdAt: now,
    };
  });

  // PATCH /api/actions/:id - Update action
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as UpdateActionBody;
    
    const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(id) as
      | { id: string; completed_at: string | null }
      | undefined;
    
    if (!action) {
      reply.status(404);
      return { error: 'Action not found' };
    }
    
    const updates: string[] = [];
    const params: (string | null)[] = [];
    
    if (body.title !== undefined) {
      updates.push('title = ?');
      params.push(body.title.trim());
    }
    
    if (body.body !== undefined) {
      updates.push('body = ?');
      params.push(body.body || null);
    }
    
    if (body.priority !== undefined) {
      updates.push('priority = ?');
      params.push(body.priority);
    }
    
    if (body.dueAt !== undefined) {
      updates.push('due_at = ?');
      params.push(body.dueAt);
    }
    
    if (body.epicId !== undefined) {
      updates.push('epic_id = ?');
      params.push(body.epicId);
    }
    
    if (body.status !== undefined) {
      if (body.status === 'done') {
        updates.push('completed_at = ?');
        params.push(new Date().toISOString());
      } else if (body.status === 'open') {
        updates.push('completed_at = ?');
        params.push(null);
      }
    }
    
    if (updates.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    db.prepare(`UPDATE actions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updated = db.prepare('SELECT * FROM actions WHERE id = ?').get(id);
    return { action: updated };
  });

  // DELETE /api/actions/:id - Delete action
  server.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(id);
    if (!action) {
      reply.status(404);
      return { error: 'Action not found' };
    }
    
    db.prepare('DELETE FROM actions WHERE id = ?').run(id);
    
    reply.status(204);
    return;
  });
}
