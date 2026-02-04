// Rollback utility - for development use only
import { db } from './connection.js';

const ROLLBACK_SQL = `
  -- Drop FTS5 triggers
  DROP TRIGGER IF EXISTS actions_fts_insert;
  DROP TRIGGER IF EXISTS actions_fts_update;
  DROP TRIGGER IF EXISTS actions_fts_delete;
  DROP TRIGGER IF EXISTS knowledge_fts_insert;
  DROP TRIGGER IF EXISTS knowledge_fts_update;
  DROP TRIGGER IF EXISTS knowledge_fts_delete;
  DROP TRIGGER IF EXISTS epics_fts_insert;
  DROP TRIGGER IF EXISTS epics_fts_update;
  DROP TRIGGER IF EXISTS epics_fts_delete;

  -- Drop FTS5 table
  DROP TABLE IF EXISTS search_fts;

  -- Drop all tables
  DROP TABLE IF EXISTS migrations;
  DROP TABLE IF EXISTS push_subscriptions;
  DROP TABLE IF EXISTS jobs;
  DROP TABLE IF EXISTS event_runs;
  DROP TABLE IF EXISTS event_epic_candidates;
  DROP TABLE IF EXISTS issues;
  DROP TABLE IF EXISTS dependencies;
  DROP TABLE IF EXISTS blockers;
  DROP TABLE IF EXISTS knowledge_items;
  DROP TABLE IF EXISTS mentions;
  DROP TABLE IF EXISTS actions;
  DROP TABLE IF EXISTS epic_aliases;
  DROP TABLE IF EXISTS epics;
  DROP TABLE IF EXISTS events;
`;

export function rollback(): void {
  console.log('Rolling back all migrations...');
  db.exec(ROLLBACK_SQL);
  console.log('Rollback completed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  rollback();
  db.close();
  process.exit(0);
}
