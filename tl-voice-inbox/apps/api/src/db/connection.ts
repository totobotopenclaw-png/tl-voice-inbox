import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'tl-voice-inbox.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Create database connection with WAL mode for better concurrency
export const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Enable FTS5 extension (usually built-in)
const hasFts5 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='search_fts'").get();
console.log(`Database connected: ${DB_PATH}`);
console.log(`FTS5 enabled: ${hasFts5 !== undefined ? 'yes' : 'will create'}`);
