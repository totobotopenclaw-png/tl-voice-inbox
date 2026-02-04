# TL Voice Inbox

**Local voice inbox for Tech Leads.**

Capture work updates, blockers, dependencies, and technical knowledge via voice. Your data stays local — no cloud, no SaaS.

[![GitHub](https://img.shields.io/github/stars/totobotopenclaw-png/tl-voice-inbox)](https://github.com/totobotopenclaw-png/tl-voice-inbox)

## Features

🎙️ **Voice Capture** - Record from any device on your LAN  
🧠 **Local AI** - STT with whisper.cpp, extraction with llama.cpp  
📊 **Epic Organization** - Auto-assign to projects with fuzzy matching  
🔍 **Fast Search** - SQLite FTS5 with BM25 ranking  
🔔 **Push Notifications** - Web Push for deadlines and reviews  
🔒 **Privacy First** - Everything stays on your machine  

## Quick Start

### Prerequisites
- Node.js 22+
- pnpm 9+
- whisper.cpp binary
- llama.cpp binary (for AI extraction)

### Install & Run

```bash
# Clone
git clone https://github.com/totobotopenclaw-png/tl-voice-inbox.git
cd tl-voice-inbox

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env with your paths

# Download models
pnpm model:download tiny
# pnpm llm:download <url>  # For AI extraction

# Setup database
pnpm db:migrate

# Build webapp
pnpm build:web

# Start server
pnpm start
```

Open http://localhost:3000

### Windows Quick Start

Double-click `start.bat` after setting up prerequisites.

## Documentation

- [Deployment Guide](DEPLOY.md) - Full deployment instructions for Windows miniPC
- [Environment Configuration](.env.example) - All configuration options

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Webapp    │──────▶│  Fastify API │──────▶│   SQLite    │
│  (React)    │◀──────│  (Node.js)   │◀──────│   + FTS5    │
└─────────────┘      └──────┬───────┘      └─────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
      ┌─────────┐     ┌──────────┐    ┌──────────┐
      │whisper  │     │  Job     │    │  llama   │
      │.cpp     │     │  Queue   │    │ -server  │
      └─────────┘     └──────────┘    └──────────┘
```

## Development Status

| Milestone | Status | Description |
|-----------|--------|-------------|
| M0-M1 | ✅ | Bootstrap, DB, Search |
| M2 | ✅ | Webapp UI |
| M3 | ✅ | Audio capture, Events API |
| M4 | ✅ | Job queue, STT worker |
| M5 | 🔄 | Epics, Needs review |
| M6 | 🔄 | LLM extractor |
| M7 | ⏳ | Actions/Knowledge UI polish |
| M8 | ⏳ | Push notifications |
| M9 | ⏳ | Hardening, metrics |

## Tech Stack

- **Backend**: Node.js, Fastify, TypeScript, better-sqlite3
- **Frontend**: React, Vite, Tailwind CSS, Lucide icons
- **STT**: whisper.cpp (local)
- **LLM**: llama.cpp (local)
- **Queue**: SQLite-based with row locking
- **Search**: SQLite FTS5 with BM25

## License

MIT

## Support

Issues and PRs welcome at https://github.com/totobotopenclaw-png/tl-voice-inbox
