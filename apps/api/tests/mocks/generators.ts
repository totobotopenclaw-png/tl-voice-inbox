import type { 
  Event, 
  Epic, 
  Action, 
  KnowledgeItem, 
  Blocker, 
  Dependency, 
  Issue,
  Job,
  EpicAlias,
  Mention,
  EventEpicCandidate,
} from '@tl-voice-inbox/shared';

let idCounter = 0;

export function resetMockIdCounter(): void {
  idCounter = 0;
}

export function generateId(prefix = 'test'): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

export function createMockEvent(overrides: Partial<Event> = {}): Event {
  const now = new Date().toISOString();
  return {
    id: generateId('event'),
    audio_path: `/uploads/test-${generateId()}.webm`,
    transcript: null,
    transcript_expires_at: null,
    status: 'queued',
    status_reason: null,
    detected_command: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockEpic(overrides: Partial<Epic> = {}): Epic {
  const now = new Date().toISOString();
  return {
    id: generateId('epic'),
    title: `Test Epic ${idCounter}`,
    description: 'A test epic for testing purposes',
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockEpicAlias(epicId: string, overrides: Partial<EpicAlias> = {}): EpicAlias {
  const now = new Date().toISOString();
  const alias = `alias-${idCounter}`;
  return {
    id: generateId('alias'),
    epic_id: epicId,
    alias,
    alias_norm: alias.toLowerCase(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockAction(eventId: string, overrides: Partial<Action> = {}): Action {
  const now = new Date().toISOString();
  return {
    id: generateId('action'),
    source_event_id: eventId,
    epic_id: null,
    type: 'follow_up',
    title: `Test Action ${idCounter}`,
    body: 'Test action body',
    priority: 'P2',
    due_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockMention(actionId: string, overrides: Partial<Mention> = {}): Mention {
  const now = new Date().toISOString();
  return {
    id: generateId('mention'),
    action_id: actionId,
    name: `Person ${idCounter}`,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockKnowledgeItem(eventId: string, overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  const now = new Date().toISOString();
  return {
    id: generateId('knowledge'),
    source_event_id: eventId,
    epic_id: null,
    title: `Test Knowledge ${idCounter}`,
    kind: 'tech',
    tags: ['test', 'example'],
    body_md: '# Test Knowledge\n\nThis is test content.',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockBlocker(eventId: string, overrides: Partial<Blocker> = {}): Blocker {
  const now = new Date().toISOString();
  return {
    id: generateId('blocker'),
    source_event_id: eventId,
    epic_id: null,
    description: `Test blocker ${idCounter}`,
    status: 'open',
    resolved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockDependency(eventId: string, overrides: Partial<Dependency> = {}): Dependency {
  const now = new Date().toISOString();
  return {
    id: generateId('dependency'),
    source_event_id: eventId,
    epic_id: null,
    description: `Test dependency ${idCounter}`,
    status: 'open',
    resolved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockIssue(eventId: string, overrides: Partial<Issue> = {}): Issue {
  const now = new Date().toISOString();
  return {
    id: generateId('issue'),
    source_event_id: eventId,
    epic_id: null,
    description: `Test issue ${idCounter}`,
    status: 'open',
    resolved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockJob(eventId: string, overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: generateId('job'),
    event_id: eventId,
    type: 'stt',
    status: 'pending',
    payload: null,
    attempts: 0,
    max_attempts: 3,
    run_at: now,
    started_at: null,
    completed_at: null,
    error_message: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockEventEpicCandidate(
  eventId: string, 
  epicId: string, 
  overrides: Partial<EventEpicCandidate> = {}
): EventEpicCandidate {
  const now = new Date().toISOString();
  return {
    id: generateId('candidate'),
    event_id: eventId,
    epic_id: epicId,
    score: 0.8,
    rank: 1,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Mock data for extraction outputs
export function createMockExtractionOutput(overrides: Record<string, unknown> = {}) {
  return {
    labels: ['test', 'example'],
    resolved_epic: null,
    epic_mentions: [],
    new_actions: [
      {
        type: 'follow_up',
        title: 'Test action',
        priority: 'P2',
        due_at: null,
        mentions: [],
        body: 'Test body',
      },
    ],
    new_deadlines: [],
    blockers: [],
    dependencies: [],
    issues: [],
    knowledge_items: [],
    email_drafts: [],
    needs_review: false,
    evidence_snippets: [],
    ...overrides,
  };
}

// Mock audio file buffer
export function createMockAudioBuffer(): Buffer {
  // Create a minimal valid WebM header
  const webmHeader = Buffer.from([
    0x1A, 0x45, 0xDF, 0xA3, // EBML ID
    0x01, 0x00, 0x00, 0x00, // EBML size
    0x00, 0x00, 0x00, 0x1F, // EBML size continued
    0x42, 0x86, 0x81, 0x01, // EBMLVersion
    0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion
    0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength
    0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength
    0x42, 0x82, 0x88, 0x77, 0x65, 0x62, 0x6D, 0x00, // DocType
  ]);
  return webmHeader;
}