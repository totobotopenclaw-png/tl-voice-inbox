// Migration system for SQLite
import { db } from './connection.js';
import { v4 as uuidv4 } from 'uuid';

interface Migration {
  id: string;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    name: 'Initial schema - Core tables',
    sql: `
      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        audio_path TEXT,
        transcript TEXT,
        transcript_expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        status_reason TEXT,
        detected_command TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_transcript_expires ON events(transcript_expires_at) WHERE transcript_expires_at IS NOT NULL;

      -- Epics table
      CREATE TABLE IF NOT EXISTS epics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
      CREATE INDEX IF NOT EXISTS idx_epics_title ON epics(title);

      -- Epic aliases table
      CREATE TABLE IF NOT EXISTS epic_aliases (
        id TEXT PRIMARY KEY,
        epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        alias_norm TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_epic_aliases_epic_id ON epic_aliases(epic_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_epic_aliases_alias_norm ON epic_aliases(alias_norm);

      -- Actions table
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        priority TEXT NOT NULL DEFAULT 'P2',
        due_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_actions_source_event_id ON actions(source_event_id);
      CREATE INDEX IF NOT EXISTS idx_actions_epic_id ON actions(epic_id);
      CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(type);
      CREATE INDEX IF NOT EXISTS idx_actions_completed_at ON actions(completed_at) WHERE completed_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_actions_due_at ON actions(due_at) WHERE due_at IS NOT NULL;

      -- Mentions table
      CREATE TABLE IF NOT EXISTS mentions (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mentions_action_id ON mentions(action_id);
      CREATE INDEX IF NOT EXISTS idx_mentions_name ON mentions(name);

      -- Knowledge items table
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'tech',
        tags TEXT NOT NULL DEFAULT '[]',
        body_md TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_source_event_id ON knowledge_items(source_event_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_epic_id ON knowledge_items(epic_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_kind ON knowledge_items(kind);

      -- Blockers table
      CREATE TABLE IF NOT EXISTS blockers (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_blockers_source_event_id ON blockers(source_event_id);
      CREATE INDEX IF NOT EXISTS idx_blockers_epic_id ON blockers(epic_id);
      CREATE INDEX IF NOT EXISTS idx_blockers_status ON blockers(status);

      -- Dependencies table
      CREATE TABLE IF NOT EXISTS dependencies (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_dependencies_source_event_id ON dependencies(source_event_id);
      CREATE INDEX IF NOT EXISTS idx_dependencies_epic_id ON dependencies(epic_id);
      CREATE INDEX IF NOT EXISTS idx_dependencies_status ON dependencies(status);

      -- Issues table
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_issues_source_event_id ON issues(source_event_id);
      CREATE INDEX IF NOT EXISTS idx_issues_epic_id ON issues(epic_id);
      CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);

      -- Event epic candidates table
      CREATE TABLE IF NOT EXISTS event_epic_candidates (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        epic_id TEXT NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
        score REAL NOT NULL,
        rank INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_candidates_event_id ON event_epic_candidates(event_id);
      CREATE INDEX IF NOT EXISTS idx_candidates_epic_id ON event_epic_candidates(epic_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_event_rank ON event_epic_candidates(event_id, rank);

      -- Event runs table (observability)
      CREATE TABLE IF NOT EXISTS event_runs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        input_snapshot TEXT NOT NULL,
        output_snapshot TEXT,
        error_message TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_event_runs_event_id ON event_runs(event_id);
      CREATE INDEX IF NOT EXISTS idx_event_runs_job_type ON event_runs(job_type);
      CREATE INDEX IF NOT EXISTS idx_event_runs_status ON event_runs(status);

      -- Jobs table
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_event_id ON jobs(event_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_run_at ON jobs(run_at) WHERE status IN ('pending', 'retry');

      -- Push subscriptions table
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
    `
  },
  {
    id: '002_create_fts5_index',
    name: 'Create FTS5 search index',
    sql: `
      -- FTS5 virtual table for search
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        content_type,
        content_id,
        title,
        content,
        tokenize='porter unicode61'
      );

      -- Triggers to keep FTS index in sync with source tables

      -- Actions FTS sync
      CREATE TRIGGER IF NOT EXISTS actions_fts_insert AFTER INSERT ON actions
      BEGIN
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('action', NEW.id, NEW.title, COALESCE(NEW.body, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS actions_fts_update AFTER UPDATE ON actions
      BEGIN
        UPDATE search_fts SET title = NEW.title, content = COALESCE(NEW.body, '')
        WHERE content_type = 'action' AND content_id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS actions_fts_delete AFTER DELETE ON actions
      BEGIN
        DELETE FROM search_fts WHERE content_type = 'action' AND content_id = OLD.id;
      END;

      -- Knowledge items FTS sync
      CREATE TRIGGER IF NOT EXISTS knowledge_fts_insert AFTER INSERT ON knowledge_items
      BEGIN
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('knowledge', NEW.id, NEW.title, NEW.body_md);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_update AFTER UPDATE ON knowledge_items
      BEGIN
        UPDATE search_fts SET title = NEW.title, content = NEW.body_md
        WHERE content_type = 'knowledge' AND content_id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_delete AFTER DELETE ON knowledge_items
      BEGIN
        DELETE FROM search_fts WHERE content_type = 'knowledge' AND content_id = OLD.id;
      END;

      -- Epics FTS sync
      CREATE TRIGGER IF NOT EXISTS epics_fts_insert AFTER INSERT ON epics
      BEGIN
        INSERT INTO search_fts (content_type, content_id, title, content)
        VALUES ('epic', NEW.id, NEW.title, COALESCE(NEW.description, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS epics_fts_update AFTER UPDATE ON epics
      BEGIN
        UPDATE search_fts SET title = NEW.title, content = COALESCE(NEW.description, '')
        WHERE content_type = 'epic' AND content_id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS epics_fts_delete AFTER DELETE ON epics
      BEGIN
        DELETE FROM search_fts WHERE content_type = 'epic' AND content_id = OLD.id;
      END;
    `
  },
  {
    id: '003_migrations_tracking',
    name: 'Create migrations tracking table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    id: '004_push_notifications_tracking',
    name: 'Add push notifications sent tracking',
    sql: `
      -- Track which push notifications have been sent to avoid duplicates
      CREATE TABLE IF NOT EXISTS push_notifications_sent (
        id TEXT PRIMARY KEY,
        action_id TEXT REFERENCES actions(id) ON DELETE CASCADE,
        event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
        notification_type TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_push_notif_action ON push_notifications_sent(action_id);
      CREATE INDEX IF NOT EXISTS idx_push_notif_event ON push_notifications_sent(event_id);
      CREATE INDEX IF NOT EXISTS idx_push_notif_type ON push_notifications_sent(notification_type);
    `
  },
  {
    id: '005_dead_letter_queue',
    name: 'Add dead letter queue for failed jobs',
    sql: `
      -- Dead letter queue for permanently failed jobs
      CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        dead_letter_at TEXT NOT NULL DEFAULT (datetime('now')),
        dead_letter_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dead_letter_job_id ON dead_letter_queue(job_id);
      CREATE INDEX IF NOT EXISTS idx_dead_letter_event_id ON dead_letter_queue(event_id);
      CREATE INDEX IF NOT EXISTS idx_dead_letter_type ON dead_letter_queue(type);
      CREATE INDEX IF NOT EXISTS idx_dead_letter_at ON dead_letter_queue(dead_letter_at);
    `
  },
  {
    id: '006_add_jobs_cancelled_at',
    name: 'Add cancelled_at column to jobs table',
    sql: `
      -- Add cancelled_at column for job cancellation tracking
      ALTER TABLE jobs ADD COLUMN cancelled_at TEXT;
      ALTER TABLE jobs ADD COLUMN cancelled_by TEXT;
      ALTER TABLE jobs ADD COLUMN dead_letter_at TEXT;
      ALTER TABLE jobs ADD COLUMN dead_letter_reason TEXT;

      CREATE INDEX IF NOT EXISTS idx_jobs_cancelled_at ON jobs(cancelled_at) WHERE cancelled_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_jobs_dead_letter_at ON jobs(dead_letter_at) WHERE dead_letter_at IS NOT NULL;
    `
  }
];

export function migrate(): void {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const appliedMigrations = db.prepare('SELECT id FROM migrations').all() as { id: string }[];
  const appliedIds = new Set(appliedMigrations.map(m => m.id));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      console.log(`Migration ${migration.id} already applied, skipping`);
      continue;
    }

    console.log(`Applying migration: ${migration.id} - ${migration.name}`);
    
    const transaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
    });

    transaction();
    console.log(`Migration ${migration.id} applied successfully`);
  }

  console.log('All migrations completed');
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  process.exit(0);
}
