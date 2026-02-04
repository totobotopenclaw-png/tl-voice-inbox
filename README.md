# TL Voice Inbox

Local voice inbox app for Tech Leads. Capture updates, blockers, dependencies, and knowledge via voice, with automatic organization and search.

## Milestones

### ✅ Milestone 0 - Bootstrap
- [x] Monorepo with pnpm workspaces
- [x] TypeScript configuration for all packages
- [x] Fastify API skeleton with `/health` endpoint
- [x] React webapp skeleton

### ✅ Milestone 1 - DB + Search
- [x] SQLite with better-sqlite3 (synchronous API)
- [x] All core tables from PRD section 8.1
- [x] FTS5 virtual table for search
- [x] BM25 ranking for search results
- [x] Database migrations system
- [x] Test script verifying all functionality

## Project Structure

```
tl-voice-inbox/
├── apps/
│   ├── api/                    # Fastify API server
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── connection.ts      # SQLite connection
│   │   │   │   ├── migrate.ts         # Migration runner
│   │   │   │   ├── rollback.ts        # Rollback utility
│   │   │   │   ├── test.ts            # Database tests
│   │   │   │   └── repositories/
│   │   │   │       ├── search.ts      # FTS5 search repository
│   │   │   │       └── index.ts       # All CRUD repositories
│   │   │   ├── routes/
│   │   │   │   ├── health.ts          # /health endpoint
│   │   │   │   └── search.ts          # /search endpoints
│   │   │   └── index.ts               # Server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # React + Vite webapp
│       ├── src/
│       │   ├── App.tsx
│       │   ├── App.css
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   └── shared/                 # Shared types
│       └── src/
│           └── index.ts        # All domain types
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # pnpm workspace config
├── tsconfig.json               # Root TypeScript config
├── .eslintrc.json
├── .prettierrc.json
└── .gitignore
```

## Quick Start

### Prerequisites
- Node.js 22+
- pnpm 9+

### Installation

```bash
# Install dependencies
pnpm install

# Run migrations
pnpm db:migrate

# Start both API and webapp
pnpm dev
```

### Run API Only

```bash
pnpm dev:api
```

API will be available at `http://localhost:3000`
- Health check: `GET /api/health`
- Search: `GET /api/search?q=query&limit=20`

### Run Webapp Only

```bash
pnpm dev:web
```

Webapp will be available at `http://localhost:5173`

### Database Operations

```bash
# Run migrations
pnpm db:migrate

# Rollback all migrations (dev only)
pnpm db:rollback

# Run database tests
pnpm test:db
```

## Database Schema

### Core Tables
- `events` - Voice events (audio, transcript, status)
- `epics` - Project epics
- `epic_aliases` - Aliases for fuzzy epic matching
- `actions` - Follow-ups, deadlines, emails
- `mentions` - People mentioned in actions
- `knowledge_items` - Technical notes and decisions
- `blockers`, `dependencies`, `issues` - Epic tracking
- `event_epic_candidates` - Candidate epics for events
- `event_runs` - Observability data
- `jobs` - Job queue for async processing
- `push_subscriptions` - Web Push subscriptions

### FTS5 Search
- `search_fts` - Virtual table with triggers for automatic indexing
- BM25 ranking for relevance scoring
- Supports actions, knowledge items, and epics

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/search?q=query` | Full-text search |
| POST | `/api/search/index` | Rebuild FTS index |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | API server port |
| `HOST` | 0.0.0.0 | API server host |
| `DATA_DIR` | ./data | Data directory |
| `DB_PATH` | {DATA_DIR}/tl-voice-inbox.db | SQLite database path |

## Search Query Syntax

The search uses SQLite FTS5 with Porter stemming and Unicode61 tokenizer:

- Basic: `database migration`
- Phrase: `"exact phrase"`
- Exclude: `database -legacy`
- Prefix: `migrat*`

Results are ranked by BM25 (lower = better match).

## License

MIT
