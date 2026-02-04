// Epics CRUD routes + alias management + snapshot

import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { 
  findEpicById, 
  getEpicSnapshot, 
  getStoredCandidates,
  findEpicCandidates,
  storeEpicCandidates 
} from '../services/epic-matcher.js';
import { enqueue } from '../queue/manager.js';

interface CreateEpicBody {
  title: string;
  description?: string;
  aliases?: string[];
}

interface UpdateEpicBody {
  title?: string;
  description?: string;
  status?: 'active' | 'archived';
}

interface AddAliasBody {
  alias: string;
}

export async function epicsRoutes(server: FastifyInstance): Promise<void> {
  
  // GET /api/epics - List all epics with stats
  server.get('/', async (request) => {
    const { status = 'active', limit = '50', offset = '0' } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };
    
    // Get epics with basic info
    const epicsRows = db.prepare(`
      SELECT id, title, description, status, created_at, updated_at
      FROM epics
      WHERE status = ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(status, limit, offset) as Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>;
    
    // Get stats for each epic
    const epics = epicsRows.map(epic => {
      // Count actions
      const actionsCount = db.prepare(`
        SELECT COUNT(*) as count FROM actions WHERE epic_id = ?
      `).get(epic.id) as { count: number };
      
      // Count open blockers
      const blockersCount = db.prepare(`
        SELECT COUNT(*) as count FROM blockers WHERE epic_id = ? AND status = 'open'
      `).get(epic.id) as { count: number };
      
      // Count dependencies
      const depsCount = db.prepare(`
        SELECT COUNT(*) as count FROM dependencies WHERE epic_id = ? AND status = 'open'
      `).get(epic.id) as { count: number };
      
      // Count issues
      const issuesCount = db.prepare(`
        SELECT COUNT(*) as count FROM issues WHERE epic_id = ? AND status = 'open'
      `).get(epic.id) as { count: number };
      
      // Count knowledge items
      const knowledgeCount = db.prepare(`
        SELECT COUNT(*) as count FROM knowledge_items WHERE epic_id = ?
      `).get(epic.id) as { count: number };
      
      // Get aliases
      const aliasesRows = db.prepare(`
        SELECT alias FROM epic_aliases WHERE epic_id = ?
      `).all(epic.id) as Array<{ alias: string }>;
      
      return {
        id: epic.id,
        title: epic.title,
        description: epic.description,
        status: epic.status,
        aliases: aliasesRows.map(a => a.alias),
        stats: {
          actions: actionsCount.count,
          blockers: blockersCount.count,
          dependencies: depsCount.count,
          issues: issuesCount.count,
          knowledge: knowledgeCount.count,
        },
        createdAt: epic.created_at,
        updatedAt: epic.updated_at,
      };
    });
    
    return { epics };
  });
  
  // POST /api/epics - Create new epic
  server.post('/', async (request, reply) => {
    const body = request.body as CreateEpicBody;
    
    if (!body.title || body.title.trim().length === 0) {
      reply.status(400);
      return { error: 'Title is required' };
    }
    
    const epicId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO epics (id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(epicId, body.title.trim(), body.description || null, now, now);
    
    // Add aliases if provided
    if (body.aliases && body.aliases.length > 0) {
      const aliasStmt = db.prepare(`
        INSERT INTO epic_aliases (id, epic_id, alias, alias_norm, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const alias of body.aliases) {
        const normalized = alias.toLowerCase().trim();
        aliasStmt.run(crypto.randomUUID(), epicId, alias.trim(), normalized, now, now);
      }
    }
    
    reply.status(201);
    return {
      id: epicId,
      title: body.title,
      description: body.description || null,
      status: 'active',
      createdAt: now,
    };
  });
  
  // GET /api/epics/:id - Get epic detail with snapshot
  server.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const epic = findEpicById(id);
    if (!epic) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    const snapshot = getEpicSnapshot(id);
    
    return {
      epic: {
        id: epic.id,
        title: epic.title,
        description: epic.description,
        status: epic.status,
        createdAt: snapshot?.epic ? undefined : undefined, // Will be filled below
      },
      snapshot,
    };
  });
  
  // PATCH /api/epics/:id - Update epic
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as UpdateEpicBody;
    
    const epic = findEpicById(id);
    if (!epic) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    const updates: string[] = [];
    const params: (string | null)[] = [];
    
    if (body.title !== undefined) {
      updates.push('title = ?');
      params.push(body.title.trim());
    }
    
    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description || null);
    }
    
    if (body.status !== undefined) {
      updates.push('status = ?');
      params.push(body.status);
    }
    
    if (updates.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    db.prepare(`UPDATE epics SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updated = findEpicById(id);
    return { epic: updated };
  });
  
  // DELETE /api/epics/:id - Archive epic (soft delete)
  server.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    
    const epic = findEpicById(id);
    if (!epic) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    // Soft delete by archiving
    db.prepare(`
      UPDATE epics 
      SET status = 'archived', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    
    reply.status(204);
    return;
  });
  
  // POST /api/epics/:id/aliases - Add alias
  server.post<{ Params: { id: string } }>('/:id/aliases', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as AddAliasBody;
    
    if (!body.alias || body.alias.trim().length === 0) {
      reply.status(400);
      return { error: 'Alias is required' };
    }
    
    const epic = findEpicById(id);
    if (!epic) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    const normalized = body.alias.toLowerCase().trim();
    const now = new Date().toISOString();
    
    try {
      db.prepare(`
        INSERT INTO epic_aliases (id, epic_id, alias, alias_norm, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), id, body.alias.trim(), normalized, now, now);
    } catch (err) {
      // Unique constraint violation
      reply.status(409);
      return { error: 'Alias already exists' };
    }
    
    reply.status(201);
    return {
      epicId: id,
      alias: body.alias.trim(),
      normalized,
    };
  });
  
  // DELETE /api/epics/:id/aliases/:alias - Remove alias
  server.delete<{ Params: { id: string; alias: string } }>('/:id/aliases/:alias', async (request, reply) => {
    const { id, alias } = request.params;
    
    const epic = findEpicById(id);
    if (!epic) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    const normalized = decodeURIComponent(alias).toLowerCase().trim();
    
    const result = db.prepare(`
      DELETE FROM epic_aliases 
      WHERE epic_id = ? AND alias_norm = ?
    `).run(id, normalized);
    
    if (result.changes === 0) {
      reply.status(404);
      return { error: 'Alias not found' };
    }
    
    reply.status(204);
    return;
  });
  
  // GET /api/epics/:id/snapshot - Get epic snapshot (for LLM context)
  server.get<{ Params: { id: string } }>('/:id/snapshot', async (request, reply) => {
    const { id } = request.params;
    
    const snapshot = getEpicSnapshot(id);
    if (!snapshot) {
      reply.status(404);
      return { error: 'Epic not found' };
    }
    
    return { snapshot };
  });
}
