# PRD — TL Voice Inbox (Local backend + Webapp + Push)

**Estado:** v1.0 (MVP)

## 1. Contexto y problema
Como Tech Lead, necesito capturar información de trabajo (updates de épicas, bloqueos, dependencias, issues, decisiones y conocimiento técnico) sin fricción, mediante dictado libre, y que el sistema la **organice automáticamente** para poder consultar estado y ejecutar acciones.

Restricciones clave:
- Privacidad: todo **local** (miniPC Windows), sin SaaS.
- Entrada: voz en español (mezcla con términos técnicos en inglés), formato libre.
- Calidad > latencia: ingesta puede tardar ~10–30s, pero consulta/búsqueda debe ser rápida.

## 2. Objetivos
- Captura por voz desde navegador (MVP) y organización automática.
- Tablero web con búsqueda y filtros por épica, acciones, deadlines y knowledge.
- Recordatorios con hora exacta (deadlines) y follow-ups priorizados.
- Flujo robusto de ambigüedad: **Needs review** + reproceso “lo más correcto”.
- Preparación de texto para emails (copiar/pegar en Gmail).

## 3. No objetivos (MVP)
- Integración con Jira/Slack/Calendar/Gmail API.
- Apps nativas (tray/hotkey global) en v1.
- Multiusuario, login complejo.
- Vector DB (Chroma) o embeddings semánticos (se evalúa v1.1+).

## 4. Target platform
- Backend local en miniPC Windows 11 (CPU-only, Intel i5-1250P, 32GB RAM).
- Webapp React+Vite servida por el backend.
- Acceso desde otros dispositivos por LAN (Chrome/Edge).

## 5. Arquitectura (MVP)
### 5.1 Componentes
- **API/Web server**: Node.js + Fastify + TypeScript.
- **DB**: SQLite + FTS5 (bm25 ranking).
- **STT worker**: whisper.cpp (subprocess) para transcripción offline.
- **LLM worker**: llama.cpp `llama-server` (subprocess/managed) + modelo GGUF descargado.
- **Job queue**: tabla `jobs` en SQLite + workers.
- **Push**: Web Push (Service Worker) + VAPID, server con librería `web-push`.

### 5.2 Principios
- **Event store + proyecciones**: guardar eventos y derivar read models.
- **Epics-first retrieval**: contexto prioriza épicas si hay match.
- **Needs review** si ambigüedad: no contaminar estado; reprocesar con contexto correcto.
- **Idempotencia**: reprocess no duplica ni deja residuos.

## 6. Experiencia de usuario (MVP)
### 6.1 Captura
- Botón “Grabar” en webapp → grabación con MediaRecorder.
- “Parar” → se sube audio → estado del evento: `queued → transcribed → processed`.

### 6.2 Navegación
Sidebar:
- Inbox (acciones)
- Deadlines
- Needs review
- Epics
- Knowledge

### 6.3 Needs review
Tarjeta por evento ambiguo:
- Evidencia (transcript si no expiró TTL; si no, snippets).
- Top 2–3 épicas candidatas + botón “Asignar a …”
- Botón “Sin épica”

Al asignar:
- Se dispara **reprocess** (extracción final con snapshot de épica elegida).

### 6.4 Emails
- Vista “Email drafts” (o dentro de action type=email): Subject + Body + botón “Copy”.

### 6.5 Recordatorios
- Deadlines generan notificaciones push (due y opcional soon).
- Follow-ups quedan en Inbox con prioridad.

## 7. Comandos por voz (opcionales, solo español)
Prefijos:
- “Crear recordatorio …”
- “Crear deadline …”
- “Crear follow-up …”
- “Crear email …”
- “Nota técnica …”
- “Decisión …”

Reglas:
- Si hay fecha/hora → `deadline`.
- Si no hay fecha/hora → `follow_up`.
- Nombres de personas: libres (texto).

## 8. Datos y modelo
### 8.1 Tablas (mínimas)
- `events`
- `epics`, `epic_aliases`
- `actions`, `mentions`
- `knowledge_items`
- `blockers`, `dependencies`, `issues`
- `event_epic_candidates`
- `event_runs`
- `jobs`
- `push_subscriptions`
- `search_fts` (FTS5)

### 8.2 Retención
- `events.transcript` con TTL configurable (default 14 días).
- Botón “Purge all” para borrar transcripts/evidencia sensible.

## 9. Búsqueda
- FTS5 sobre acciones, knowledge, epics, (y events mientras TTL).
- Orden por `bm25(search_fts)`.

## 10. Pipeline de procesamiento
### 10.1 Job types
- `stt`: audio → transcript
- `extract`: transcript → candidates → LLM → persist
- `reprocess`: forced epic → LLM → persist (idempotente)
- `push`: envío notificaciones

### 10.2 Flow
1) `POST /api/events` guarda audio temporal + crea `event` + encola `stt`.
2) `stt` corre whisper.cpp, guarda transcript, encola `extract`.
3) `extract`:
   - detecta command
   - calcula candidatos épica (aliases + FTS)
   - si ambigüedad → `needs_review` + push
   - si no → build context (snapshot+snippets) → llama LLM → valida JSON → escribe proyecciones
4) `resolve` en UI encola `reprocess`.
5) `reprocess` re-ejecuta extracción con contexto correcto y actualiza proyecciones.

## 11. Retrieval “Epics-first” (detalle)
- Paso A: match exacto por `epic_aliases.alias_norm`.
- Paso B: FTS5 sobre `epics.title` y aliases → top3.
- Si top1-top2 < threshold → needs_review.
- Contexto para LLM:
  - Epic snapshot (bloqueos/dep/issues/actions open + aliases)
  - Últimos 3 eventos de esa épica (snippets)
  - Top 5 knowledge snippets relacionados

## 12. Contrato del extractor (JSON)
Salida estricta (ejemplo):
```json
{
  "labels": ["EpicUpdate", "KnowledgeNote"],
  "resolved_epic": {"epic_id": "...", "confidence": 0.81},
  "epic_mentions": [{"name": "CP33", "confidence": 0.7}],
  "new_actions": [
    {"type":"follow_up","title":"Comprobar resultado con OpenSea Destinations","priority":"P1","due_at":null,
     "mentions": ["Ana"], "body":""}
  ],
  "new_deadlines": [
    {"title":"Enviar update antes de la 1","priority":"P0","due_at":"2026-02-05T13:00:00+01:00"}
  ],
  "blockers": [{"description":"Esperando web complete...","status":"open"}],
  "dependencies": [{"description":"Depende de backend...","status":"open"}],
  "issues": [{"description":"Se han levantado 2 issues...","status":"open"}],
  "knowledge_items": [
    {"title":"Backend SuccessPage bookings","kind":"tech","tags":["backend","bookings"],"body_md":"..."}
  ],
  "email_drafts": [{"subject":"Unblock needed: ...","body":"..."}],
  "needs_review": false,
  "evidence_snippets": ["..."]
}
```
Validación:
- Si JSON no valida → retry con prompt más estricto.
- Si `needs_review=true` → no aplicar cambios destructivos a épicas.

## 13. Push notifications (Web Push)
- Webapp registra Service Worker.
- Subscribe → `POST /api/push/subscribe`.
- Tipos:
  - `deadline_due`
  - `deadline_soon` (configurable)
  - `needs_review`
- Server envía con `web-push` + VAPID.

## 14. Seguridad (MVP)
- Todo local; sin telemetría.
- Exposición LAN: permitir binding a `0.0.0.0` con opción de restringir a subred/Firewall.
- (Opcional v1.1) PIN simple.

## 15. Métricas locales (sin salir del equipo)
- Latencia por etapa (stt, extract, reprocess).
- Ratio needs_review.
- Fallos de JSON/ retries.

## 16. Criterios de aceptación
- Puedo grabar desde navegador y ver acciones/knowledge aparecer.
- Búsqueda responde rápido (FTS5).
- Deadlines disparan push en Chrome/Edge.
- Needs review evita asignaciones erróneas y permite resolver con 1 click, reprocesando.

---

# Planning de tareas (OpenClaw)

## Milestone 0 — Bootstrap (Día 1)
1. Crear monorepo (pnpm o npm workspaces): `apps/api`, `apps/web`, `packages/shared`.
2. Config TS, lint, formatting.
3. Skeleton Fastify + endpoint `/health`.

## Milestone 1 — DB + Search (Día 2–3)
4. Integrar SQLite (better-sqlite3 o sqlite3) + migraciones.
5. Crear tablas core + FTS5 `search_fts`.
6. Implementar query search con `MATCH` + `ORDER BY bm25(...)`.

## Milestone 2 — Webapp UI básica (Día 3–4)
7. React+Vite layout + router.
8. Sidebar + páginas vacías.
9. Search UI (llama a `/api/search`).

## Milestone 3 — Audio capture + events (Día 4–6)
10. MediaRecorder (start/stop) + upload multipart.
11. `POST /api/events` crea event + guarda audio temp + encola job `stt`.
12. UI timeline de events y estado.

## Milestone 4 — Job queue + STT worker (Día 6–8)
13. Tabla `jobs` + locking simple.
14. Worker `stt`: ejecutar whisper.cpp → transcript → actualizar event → encolar `extract`.
15. TTL de transcript + purge endpoint.

## Milestone 5 — Epics + candidates + Needs review (Día 8–10)
16. CRUD Epics + Aliases.
17. Candidate scoring: exact alias + FTS5 top3.
18. Threshold + crear `event_epic_candidates`.
19. UI Needs review: asignar épica o null → `POST /resolve`.

## Milestone 6 — LLM runtime + extractor (Día 10–13)
20. Gestionar `llama-server` como subprocess (start/stop/health).
21. Descargar modelo GGUF (primer arranque) + checksum.
22. Worker `extract/reprocess`: prompt + llamada HTTP a `/v1/chat/completions` + validación JSON.
23. Persistencia idempotente de proyecciones (source_event_id).

## Milestone 7 — Actions/Knowledge UI (Día 13–15)
24. Inbox (acciones) + filtros.
25. Knowledge list/detail + markdown render.
26. Epic detail: snapshot + blockers/dep/issues/actions.

## Milestone 8 — Push notifications (Día 15–17)
27. Service worker + subscribe flow en web.
28. API subscribe/unsubscribe + DB storage.
29. Integrar `web-push` + VAPID keys.
30. Scheduler: deadline_due + needs_review push.

## Milestone 9 — Hardening + DX (Día 17–19)
31. Retry/backoff jobs + max attempts.
32. Observabilidad local: logs + event_runs.
33. Backup/export (JSON/MD) mínimo.

## Milestone 10 — v1.1 (opcional)
34. Tray app + hotkey + audio capture (Windows).
35. Embeddings + sqlite-vec (solo si búsqueda semántica se echa en falta).
