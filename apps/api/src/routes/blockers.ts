// Blockers and Dependencies API routes

import type { FastifyInstance } from 'fastify';
import { blockersRepository, dependenciesRepository, eventsRepository } from '../db/repositories/index.js';
import { db } from '../db/connection.js';

/**
 * Get or create a sentinel event used as source_event_id for manually created items.
 * The blockers/dependencies tables have NOT NULL FK constraints on source_event_id,
 * so manual entries reference this sentinel event instead.
 */
function getManualEventId(): string {
  const MANUAL_EVENT_ID = 'manual-entry-sentinel';
  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(MANUAL_EVENT_ID) as { id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO events (id, status, created_at, updated_at) VALUES (?, 'completed', datetime('now'), datetime('now'))`
    ).run(MANUAL_EVENT_ID);
  }
  return MANUAL_EVENT_ID;
}

interface UpdateBlockerBody {
  status?: 'open' | 'resolved';
  owner?: string | null;
  eta?: string | null;
  nextFollowUpAt?: string | null;
  escalationLevel?: number;
}

interface SnoozeBody {
  until: string;
}

export async function blockersRoutes(server: FastifyInstance): Promise<void> {

  // POST /api/blockers - Create blocker manually
  server.post('/', async (request, reply) => {
    const body = request.body as {
      epicId: string;
      description: string;
      owner?: string | null;
      eta?: string | null;
    };

    if (!body.description || !body.epicId) {
      reply.status(400);
      return { error: 'epicId and description are required' };
    }

    const blocker = blockersRepository.create({
      source_event_id: getManualEventId(),
      epic_id: body.epicId,
      description: body.description,
      owner: body.owner || null,
      eta: body.eta || null,
    });

    return { blocker };
  });

  // PATCH /api/blockers/:id - Update blocker
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as UpdateBlockerBody;

    const blocker = blockersRepository.findById(id);
    if (!blocker) {
      reply.status(404);
      return { error: 'Blocker not found' };
    }

    if (body.status === 'resolved') {
      blockersRepository.resolve(id);
    } else {
      const updates: { owner?: string | null; eta?: string | null; escalation_level?: number } = {};
      if (body.owner !== undefined) updates.owner = body.owner;
      if (body.eta !== undefined) updates.eta = body.eta;
      if (body.escalationLevel !== undefined) updates.escalation_level = body.escalationLevel;

      if (Object.keys(updates).length > 0) {
        blockersRepository.update(id, updates);
      } else {
        blockersRepository.updateChecked(id);
      }
    }

    if (body.nextFollowUpAt) {
      blockersRepository.snooze(id, body.nextFollowUpAt);
    }

    const updated = blockersRepository.findById(id);
    return { blocker: updated };
  });

  // POST /api/blockers/:id/snooze - Snooze blocker
  server.post<{ Params: { id: string } }>('/:id/snooze', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as SnoozeBody;

    if (!body.until) {
      reply.status(400);
      return { error: 'until date is required' };
    }

    const blocker = blockersRepository.findById(id);
    if (!blocker) {
      reply.status(404);
      return { error: 'Blocker not found' };
    }

    blockersRepository.snooze(id, body.until);
    const updated = blockersRepository.findById(id);
    return { blocker: updated };
  });
}

export async function dependenciesRoutes(server: FastifyInstance): Promise<void> {

  // POST /api/dependencies - Create dependency manually
  server.post('/', async (request, reply) => {
    const body = request.body as {
      epicId: string;
      description: string;
      owner?: string | null;
      eta?: string | null;
    };

    if (!body.description || !body.epicId) {
      reply.status(400);
      return { error: 'epicId and description are required' };
    }

    const dependency = dependenciesRepository.create({
      source_event_id: getManualEventId(),
      epic_id: body.epicId,
      description: body.description,
      owner: body.owner || null,
      eta: body.eta || null,
    });

    return { dependency };
  });

  // PATCH /api/dependencies/:id - Update dependency
  server.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as UpdateBlockerBody;

    const dep = dependenciesRepository.findById(id);
    if (!dep) {
      reply.status(404);
      return { error: 'Dependency not found' };
    }

    if (body.status === 'resolved') {
      dependenciesRepository.resolve(id);
    } else {
      const updates: { owner?: string | null; eta?: string | null; escalation_level?: number } = {};
      if (body.owner !== undefined) updates.owner = body.owner;
      if (body.eta !== undefined) updates.eta = body.eta;
      if (body.escalationLevel !== undefined) updates.escalation_level = body.escalationLevel;

      if (Object.keys(updates).length > 0) {
        dependenciesRepository.update(id, updates);
      } else {
        dependenciesRepository.updateChecked(id);
      }
    }

    if (body.nextFollowUpAt) {
      dependenciesRepository.snooze(id, body.nextFollowUpAt);
    }

    const updated = dependenciesRepository.findById(id);
    return { dependency: updated };
  });

  // POST /api/dependencies/:id/snooze - Snooze dependency
  server.post<{ Params: { id: string } }>('/:id/snooze', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as SnoozeBody;

    if (!body.until) {
      reply.status(400);
      return { error: 'until date is required' };
    }

    const dep = dependenciesRepository.findById(id);
    if (!dep) {
      reply.status(404);
      return { error: 'Dependency not found' };
    }

    dependenciesRepository.snooze(id, body.until);
    const updated = dependenciesRepository.findById(id);
    return { dependency: updated };
  });
}
