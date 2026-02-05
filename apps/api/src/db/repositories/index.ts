import { db } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  Event,
  Epic,
  EpicAlias,
  Action,
  Mention,
  KnowledgeItem,
  Blocker,
  Dependency,
  Issue,
  EventEpicCandidate,
  Job,
  PushSubscription,
  EventRun,
} from '@tl-voice-inbox/shared';
import type { JobWithParsedPayload } from './types.js';

// Events repository
export const eventsRepository = {
  create(audioPath: string | null = null): Event {
    const id = uuidv4();
    const stmt = db.prepare(
      `INSERT INTO events (id, audio_path, status) VALUES (?, ?, 'queued')`
    );
    stmt.run(id, audioPath);
    return this.findById(id)!;
  },

  findById(id: string): Event | null {
    const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
    return (stmt.get(id) as Event) || null;
  },

  updateStatus(id: string, status: Event['status'], reason?: string): void {
    const stmt = db.prepare(
      `UPDATE events SET status = ?, status_reason = ?, updated_at = datetime('now') WHERE id = ?`
    );
    stmt.run(status, reason || null, id);
  },

  setTranscript(id: string, transcript: string, ttlDays: number = 14): void {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);
    
    const stmt = db.prepare(
      `UPDATE events SET transcript = ?, transcript_expires_at = ?, status = 'transcribed', updated_at = datetime('now') WHERE id = ?`
    );
    stmt.run(transcript, expiresAt.toISOString(), id);
  },

  purgeExpiredTranscripts(): number {
    const stmt = db.prepare(
      `UPDATE events SET transcript = NULL, transcript_expires_at = NULL 
       WHERE transcript_expires_at < datetime('now') AND transcript IS NOT NULL`
    );
    const result = stmt.run();
    return result.changes;
  },

  findNeedingReview(): Event[] {
    const stmt = db.prepare('SELECT * FROM events WHERE status = ? ORDER BY created_at DESC');
    return stmt.all('needs_review') as Event[];
  },

  findAll(): Event[] {
    const stmt = db.prepare('SELECT * FROM events ORDER BY created_at DESC');
    return stmt.all() as Event[];
  },
};

// Epics repository
export const epicsRepository = {
  create(title: string, description?: string): Epic {
    const id = uuidv4();
    const stmt = db.prepare(
      `INSERT INTO epics (id, title, description) VALUES (?, ?, ?)`
    );
    stmt.run(id, title, description || null);
    return this.findById(id)!;
  },

  findById(id: string): Epic | null {
    const stmt = db.prepare('SELECT * FROM epics WHERE id = ?');
    return (stmt.get(id) as Epic) || null;
  },

  findByAlias(aliasNorm: string): Epic | null {
    const stmt = db.prepare(`
      SELECT e.* FROM epics e
      JOIN epic_aliases ea ON e.id = ea.epic_id
      WHERE ea.alias_norm = ?
    `);
    return (stmt.get(aliasNorm) as Epic) || null;
  },

  findAllActive(): Epic[] {
    const stmt = db.prepare("SELECT * FROM epics WHERE status = 'active' ORDER BY updated_at DESC");
    return stmt.all() as Epic[];
  },

  addAlias(epicId: string, alias: string): EpicAlias {
    const id = uuidv4();
    const aliasNorm = alias.toLowerCase().trim();
    const stmt = db.prepare(
      `INSERT INTO epic_aliases (id, epic_id, alias, alias_norm) VALUES (?, ?, ?, ?)`
    );
    stmt.run(id, epicId, alias, aliasNorm);
    return { id, epic_id: epicId, alias, alias_norm: aliasNorm, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  },

  getAliases(epicId: string): EpicAlias[] {
    const stmt = db.prepare('SELECT * FROM epic_aliases WHERE epic_id = ?');
    return stmt.all(epicId) as EpicAlias[];
  },

  /**
   * Find candidate epics for an event using FTS5 ranking
   */
  findCandidates(query: string, limit: number = 3): Array<{ epic: Epic; score: number }> {
    // Escape FTS5 special characters: " [ ] ( ) * ^ { } : - , . / etc
    // Wrap in double quotes for phrase matching to avoid syntax errors
    const sanitized = query
      .replace(/"/g, '""')  // Escape double quotes
      .replace(/[\[\](){}:^*,./;!?@#$%&=+~`|\\-]/g, ' ')  // Replace special chars with space
      .trim();
    
    // If empty after sanitization, return empty results
    if (!sanitized) {
      return [];
    }
    
    // Wrap in double quotes for safe phrase matching
    const safeQuery = `"${sanitized}"`
    
    const stmt = db.prepare(`
      SELECT 
        e.*,
        bm25(search_fts, 1.0, 0.5) as score
      FROM search_fts s
      JOIN epics e ON s.content_id = e.id
      WHERE s.content_type = 'epic' AND search_fts MATCH ?
      ORDER BY score ASC
      LIMIT ?
    `);
    
    const rows = stmt.all(safeQuery, limit) as Array<Epic & { score: number }>;
    
    return rows.map(row => {
      const { score, ...epic } = row;
      return { epic, score };
    });
  },
};

// Actions repository
export const actionsRepository = {
  create(data: Omit<Action, 'id' | 'created_at' | 'updated_at' | 'completed_at'> & { completed_at?: string | null }): Action {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO actions 
      (id, source_event_id, epic_id, type, title, body, priority, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.source_event_id,
      data.epic_id,
      data.type,
      data.title,
      data.body,
      data.priority,
      data.due_at
    );
    return this.findById(id)!;
  },

  findById(id: string): Action | null {
    const stmt = db.prepare('SELECT * FROM actions WHERE id = ?');
    return (stmt.get(id) as Action) || null;
  },

  findByEventId(eventId: string): Action[] {
    const stmt = db.prepare('SELECT * FROM actions WHERE source_event_id = ?');
    return stmt.all(eventId) as Action[];
  },

  findPending(): Action[] {
    const stmt = db.prepare('SELECT * FROM actions WHERE completed_at IS NULL ORDER BY due_at ASC NULLS LAST, created_at DESC');
    return stmt.all() as Action[];
  },

  markCompleted(id: string): void {
    const stmt = db.prepare(`UPDATE actions SET completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`);
    stmt.run(id);
  },

  addMention(actionId: string, name: string): Mention {
    const id = uuidv4();
    const stmt = db.prepare('INSERT INTO mentions (id, action_id, name) VALUES (?, ?, ?)');
    stmt.run(id, actionId, name);
    return { id, action_id: actionId, name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  },

  getMentions(actionId: string): Mention[] {
    const stmt = db.prepare('SELECT * FROM mentions WHERE action_id = ?');
    return stmt.all(actionId) as Mention[];
  },
};

// Knowledge repository
export const knowledgeRepository = {
  create(data: Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at'>): KnowledgeItem {
    const id = uuidv4();
    const tagsJson = JSON.stringify(data.tags);
    const stmt = db.prepare(`
      INSERT INTO knowledge_items 
      (id, source_event_id, epic_id, title, kind, tags, body_md)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.source_event_id,
      data.epic_id,
      data.title,
      data.kind,
      tagsJson,
      data.body_md
    );
    return this.findById(id)!;
  },

  findById(id: string): KnowledgeItem | null {
    const stmt = db.prepare('SELECT * FROM knowledge_items WHERE id = ?');
    const row = stmt.get(id) as (KnowledgeItem & { tags: string }) | null;
    if (row) {
      return { ...row, tags: JSON.parse(row.tags) };
    }
    return null;
  },

  findByEventId(eventId: string): KnowledgeItem[] {
    const stmt = db.prepare('SELECT * FROM knowledge_items WHERE source_event_id = ?');
    const rows = stmt.all(eventId) as Array<KnowledgeItem & { tags: string }>;
    return rows.map(row => ({ ...row, tags: JSON.parse(row.tags) }));
  },

  findByEpicId(epicId: string, limit: number = 5): KnowledgeItem[] {
    const stmt = db.prepare('SELECT * FROM knowledge_items WHERE epic_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(epicId, limit) as Array<KnowledgeItem & { tags: string }>;
    return rows.map(row => ({ ...row, tags: JSON.parse(row.tags) }));
  },
};

// Blockers repository
export const blockersRepository = {
  create(data: Omit<Blocker, 'id' | 'created_at' | 'updated_at' | 'status' | 'resolved_at'>): Blocker {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO blockers (id, source_event_id, epic_id, description) VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, data.source_event_id, data.epic_id, data.description);
    return this.findById(id)!;
  },

  findById(id: string): Blocker | null {
    const stmt = db.prepare('SELECT * FROM blockers WHERE id = ?');
    return (stmt.get(id) as Blocker) || null;
  },

  findByEpicId(epicId: string): Blocker[] {
    const stmt = db.prepare("SELECT * FROM blockers WHERE epic_id = ? AND status = 'open'");
    return stmt.all(epicId) as Blocker[];
  },

  resolve(id: string): void {
    const stmt = db.prepare(`UPDATE blockers SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`);
    stmt.run(id);
  },
};

// Dependencies repository
export const dependenciesRepository = {
  create(data: Omit<Dependency, 'id' | 'created_at' | 'updated_at' | 'status' | 'resolved_at'>): Dependency {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO dependencies (id, source_event_id, epic_id, description) VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, data.source_event_id, data.epic_id, data.description);
    return this.findById(id)!;
  },

  findById(id: string): Dependency | null {
    const stmt = db.prepare('SELECT * FROM dependencies WHERE id = ?');
    return (stmt.get(id) as Dependency) || null;
  },

  findByEpicId(epicId: string): Dependency[] {
    const stmt = db.prepare("SELECT * FROM dependencies WHERE epic_id = ? AND status = 'open'");
    return stmt.all(epicId) as Dependency[];
  },

  resolve(id: string): void {
    const stmt = db.prepare(`UPDATE dependencies SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`);
    stmt.run(id);
  },
};

// Issues repository
export const issuesRepository = {
  create(data: Omit<Issue, 'id' | 'created_at' | 'updated_at' | 'status' | 'resolved_at'>): Issue {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO issues (id, source_event_id, epic_id, description) VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, data.source_event_id, data.epic_id, data.description);
    return this.findById(id)!;
  },

  findById(id: string): Issue | null {
    const stmt = db.prepare('SELECT * FROM issues WHERE id = ?');
    return (stmt.get(id) as Issue) || null;
  },

  findByEpicId(epicId: string): Issue[] {
    const stmt = db.prepare("SELECT * FROM issues WHERE epic_id = ? AND status = 'open'");
    return stmt.all(epicId) as Issue[];
  },

  resolve(id: string): void {
    const stmt = db.prepare(`UPDATE issues SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`);
    stmt.run(id);
  },
};

// Event epic candidates repository
export const eventEpicCandidatesRepository = {
  create(eventId: string, epicId: string, score: number, rank: number): EventEpicCandidate {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO event_epic_candidates (id, event_id, epic_id, score, rank) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, eventId, epicId, score, rank);
    return { id, event_id: eventId, epic_id: epicId, score, rank, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  },

  findByEventId(eventId: string): EventEpicCandidate[] {
    const stmt = db.prepare('SELECT * FROM event_epic_candidates WHERE event_id = ? ORDER BY rank');
    return stmt.all(eventId) as EventEpicCandidate[];
  },

  clearForEvent(eventId: string): void {
    const stmt = db.prepare('DELETE FROM event_epic_candidates WHERE event_id = ?');
    stmt.run(eventId);
  },
};

// Jobs repository
export const jobsRepository = {
  create(eventId: string, type: Job['type'], payload?: Record<string, unknown>): JobWithParsedPayload {
    const id = uuidv4();
    const payloadJson = payload ? JSON.stringify(payload) : null;
    const stmt = db.prepare(`
      INSERT INTO jobs (id, event_id, type, payload) VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, eventId, type, payloadJson);
    return this.findById(id)!;
  },

  /**
   * Enqueue a new job with optional delay and max attempts
   */
  enqueue(
    eventId: string,
    type: Job['type'],
    payload?: Record<string, unknown>,
    options: { maxAttempts?: number; delayMs?: number } = {}
  ): JobWithParsedPayload {
    const id = uuidv4();
    const payloadJson = payload ? JSON.stringify(payload) : null;
    const maxAttempts = options.maxAttempts ?? 3;
    const runAt = options.delayMs 
      ? new Date(Date.now() + options.delayMs).toISOString()
      : new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO jobs (id, event_id, type, payload, max_attempts, run_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, eventId, type, payloadJson, maxAttempts, runAt);
    return this.findById(id)!;
  },

  findById(id: string): JobWithParsedPayload | null {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    const row = stmt.get(id) as (Job & { payload: string | null }) | null;
    if (row) {
      return { ...row, payload: row.payload ? JSON.parse(row.payload) : null };
    }
    return null;
  },

  findPending(limit: number = 10): JobWithParsedPayload[] {
    const stmt = db.prepare(`
      SELECT * FROM jobs 
      WHERE status IN ('pending', 'retry') AND run_at <= datetime('now')
      ORDER BY created_at ASC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<Job & { payload: string | null }>;
    return rows.map(row => ({ ...row, payload: row.payload ? JSON.parse(row.payload) : null }));
  },

  findByEventId(eventId: string): Job[] {
    const stmt = db.prepare('SELECT * FROM jobs WHERE event_id = ? ORDER BY created_at ASC');
    return stmt.all(eventId) as Job[];
  },

  markRunning(id: string): void {
    const stmt = db.prepare(`
      UPDATE jobs SET status = 'running', started_at = datetime('now'), attempts = attempts + 1, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(id);
  },

  markCompleted(id: string): void {
    const stmt = db.prepare(`
      UPDATE jobs SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(id);
  },

  markFailed(id: string, errorMessage: string, retry: boolean = true): void {
    const job = this.findById(id);
    if (!job) return;

    if (retry && job.attempts + 1 < job.max_attempts) {
      const runAt = new Date();
      runAt.setMinutes(runAt.getMinutes() + Math.pow(2, job.attempts)); // Exponential backoff
      
      const stmt = db.prepare(`
        UPDATE jobs SET status = 'retry', error_message = ?, run_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(errorMessage, runAt.toISOString(), id);
    } else {
      const stmt = db.prepare(`
        UPDATE jobs SET status = 'failed', error_message = ?, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(errorMessage, id);
    }
  },
};

// Push subscriptions repository
export const pushSubscriptionsRepository = {
  create(data: Omit<PushSubscription, 'id' | 'created_at' | 'updated_at'>): PushSubscription {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.endpoint, data.p256dh, data.auth, data.user_agent);
    return this.findById(id)!;
  },

  findById(id: string): PushSubscription | null {
    const stmt = db.prepare('SELECT * FROM push_subscriptions WHERE id = ?');
    return (stmt.get(id) as PushSubscription) || null;
  },

  findByEndpoint(endpoint: string): PushSubscription | null {
    const stmt = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?');
    return (stmt.get(endpoint) as PushSubscription) || null;
  },

  findAll(): PushSubscription[] {
    const stmt = db.prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC');
    return stmt.all() as PushSubscription[];
  },

  deleteByEndpoint(endpoint: string): void {
    const stmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
    stmt.run(endpoint);
  },
};

// Event runs repository (observability)
export const eventRunsRepository = {
  create(eventId: string, jobType: EventRun['job_type'], input: Record<string, unknown>): EventRun {
    const id = uuidv4();
    const inputJson = JSON.stringify(input);
    const stmt = db.prepare(`
      INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot) VALUES (?, ?, ?, 'success', ?)
    `);
    stmt.run(id, eventId, jobType, inputJson);
    return this.findById(id)!;
  },

  findById(id: string): EventRun | null {
    const stmt = db.prepare('SELECT * FROM event_runs WHERE id = ?');
    const row = stmt.get(id) as (EventRun & { input_snapshot: string; output_snapshot: string | null }) | null;
    if (row) {
      return {
        ...row,
        input_snapshot: row.input_snapshot,
        output_snapshot: row.output_snapshot,
      };
    }
    return null;
  },

  findByEventId(eventId: string): EventRun[] {
    const stmt = db.prepare('SELECT * FROM event_runs WHERE event_id = ? ORDER BY created_at DESC');
    return stmt.all(eventId) as EventRun[];
  },

  complete(id: string, output?: Record<string, unknown>, durationMs?: number): void {
    const outputJson = output ? JSON.stringify(output) : null;
    const stmt = db.prepare(`
      UPDATE event_runs SET status = 'success', output_snapshot = ?, duration_ms = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(outputJson, durationMs || 0, id);
  },

  fail(id: string, errorMessage: string, durationMs?: number): void {
    const stmt = db.prepare(`
      UPDATE event_runs SET status = 'error', error_message = ?, duration_ms = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(errorMessage, durationMs || 0, id);
  },
};
