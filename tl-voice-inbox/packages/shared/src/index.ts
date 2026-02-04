// Core domain types for TL Voice Inbox

// Event lifecycle states
export type EventStatus =
  | 'queued'
  | 'transcribing'
  | 'transcribed'
  | 'processing'
  | 'needs_review'
  | 'completed'
  | 'failed';

// Job types
export type JobType = 'stt' | 'extract' | 'reprocess' | 'push';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retry';

// Action types and priorities
export type ActionType = 'follow_up' | 'deadline' | 'email';
export type Priority = 'P0' | 'P1' | 'P2';

// Event run status for observability
export type EventRunStatus = 'success' | 'error' | 'retry';

// Base entity with common fields
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// Event entity
export interface Event extends BaseEntity {
  audio_path: string | null;
  transcript: string | null;
  transcript_expires_at: string | null;
  status: EventStatus;
  status_reason: string | null;
  detected_command: string | null;
}

// Epic entity
export interface Epic extends BaseEntity {
  title: string;
  description: string | null;
  status: 'active' | 'archived';
}

// Epic alias for flexible matching
export interface EpicAlias extends BaseEntity {
  epic_id: string;
  alias: string;
  alias_norm: string;
}

// Action entity
export interface Action extends BaseEntity {
  source_event_id: string;
  epic_id: string | null;
  type: ActionType;
  title: string;
  body: string | null;
  priority: Priority;
  due_at: string | null;
  completed_at: string | null;
}

// Mention entity (people mentioned in actions)
export interface Mention extends BaseEntity {
  action_id: string;
  name: string;
}

// Knowledge item entity
export interface KnowledgeItem extends BaseEntity {
  source_event_id: string;
  epic_id: string | null;
  title: string;
  kind: 'tech' | 'decision' | 'process';
  tags: string[];
  body_md: string;
}

// Blocker entity
export interface Blocker extends BaseEntity {
  source_event_id: string;
  epic_id: string | null;
  description: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
}

// Dependency entity
export interface Dependency extends BaseEntity {
  source_event_id: string;
  epic_id: string | null;
  description: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
}

// Issue entity
export interface Issue extends BaseEntity {
  source_event_id: string;
  epic_id: string | null;
  description: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
}

// Event-epic candidate for disambiguation
export interface EventEpicCandidate extends BaseEntity {
  event_id: string;
  epic_id: string;
  score: number;
  rank: number;
}

// Event run for observability
export interface EventRun extends BaseEntity {
  event_id: string;
  job_type: JobType;
  status: EventRunStatus;
  input_snapshot: string; // JSON
  output_snapshot: string | null; // JSON
  error_message: string | null;
  duration_ms: number;
}

// Job entity
export interface Job extends BaseEntity {
  event_id: string;
  type: JobType;
  status: JobStatus;
  payload: string | null; // JSON
  attempts: number;
  max_attempts: number;
  run_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// Push subscription for web push
export interface PushSubscription extends BaseEntity {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}

// Search result
export interface SearchResult {
  id: string;
  type: 'action' | 'knowledge' | 'epic' | 'event';
  title: string;
  content: string;
  rank: number;
  created_at: string;
}

// LLM Extractor output types
export interface ExtractorAction {
  type: ActionType;
  title: string;
  priority: Priority;
  due_at: string | null;
  mentions: string[];
  body: string;
}

export interface ExtractorDeadline {
  title: string;
  priority: Priority;
  due_at: string;
}

export interface ExtractorBlocker {
  description: string;
  status: 'open';
}

export interface ExtractorDependency {
  description: string;
  status: 'open';
}

export interface ExtractorIssue {
  description: string;
  status: 'open';
}

export interface ExtractorKnowledgeItem {
  title: string;
  kind: 'tech' | 'decision' | 'process';
  tags: string[];
  body_md: string;
}

export interface ExtractorEmailDraft {
  subject: string;
  body: string;
}

export interface ExtractorOutput {
  labels: string[];
  resolved_epic: { epic_id: string; confidence: number } | null;
  epic_mentions: { name: string; confidence: number }[];
  new_actions: ExtractorAction[];
  new_deadlines: ExtractorDeadline[];
  blockers: ExtractorBlocker[];
  dependencies: ExtractorDependency[];
  issues: ExtractorIssue[];
  knowledge_items: ExtractorKnowledgeItem[];
  email_drafts: ExtractorEmailDraft[];
  needs_review: boolean;
  evidence_snippets: string[];
}
