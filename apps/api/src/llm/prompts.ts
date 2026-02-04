// Prompt builder for LLM extraction

export interface EpicSnapshot {
  epic: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
  aliases: string[];
  openActions: Array<{
    id: string;
    title: string;
    priority: string;
    completed_at: string | null;
  }>;
  openBlockers: Array<{
    id: string;
    description: string;
    status: string;
  }>;
  openDependencies: Array<{
    id: string;
    description: string;
    status: string;
  }>;
  openIssues: Array<{
    id: string;
    description: string;
    status: string;
  }>;
}

export interface ExtractionContext {
  transcript: string;
  epicSnapshot?: EpicSnapshot;
  recentEvents: Array<{ id: string; snippet: string; createdAt: string }>;
  relatedKnowledge: Array<{
    id: string;
    title: string;
    kind: string;
    body_md: string;
  }>;
}

// JSON schema for the extraction output (included in prompt)
const JSON_SCHEMA = `{
  "labels": ["EpicUpdate", "KnowledgeNote", "ActionItem", ...],
  "resolved_epic": {"epic_id": "uuid-or-null", "confidence": 0.0-1.0},
  "epic_mentions": [{"name": "string", "confidence": 0.0-1.0}],
  "new_actions": [
    {
      "type": "follow_up|deadline|email",
      "title": "string (required, max 500 chars)",
      "priority": "P0|P1|P2",
      "due_at": "ISO 8601 datetime or null",
      "mentions": ["person names mentioned"],
      "body": "additional context"
    }
  ],
  "new_deadlines": [
    {
      "title": "string",
      "priority": "P0|P1",
      "due_at": "ISO 8601 datetime (required)"
    }
  ],
  "blockers": [{"description": "string", "status": "open"}],
  "dependencies": [{"description": "string", "status": "open"}],
  "issues": [{"description": "string", "status": "open"}],
  "knowledge_items": [
    {
      "title": "string",
      "kind": "tech|decision|process",
      "tags": ["tag1", "tag2"],
      "body_md": "markdown content"
    }
  ],
  "email_drafts": [
    {
      "subject": "email subject line",
      "body": "email body content"
    }
  ],
  "needs_review": false,
  "evidence_snippets": ["relevant quote from transcript"]
}`;

// System prompt for extraction
const SYSTEM_PROMPT = `You are a structured data extractor for a Tech Lead's voice inbox system.

Your task is to analyze voice transcripts and extract structured project information.

RULES:
1. Output ONLY valid JSON matching the provided schema
2. Spanish input is expected - English technical terms may appear mixed in
3. Be conservative - use "needs_review": true if uncertain about epic assignment
4. P0 = urgent/critical, P1 = important, P2 = normal priority
5. Convert relative dates to absolute ISO 8601 datetimes (assume current year 2026)
6. Evidence snippets should be exact quotes from the transcript

LABELS (include all that apply):
- EpicUpdate: Update to an existing epic
- KnowledgeNote: Technical or process knowledge
- ActionItem: Follow-up action required
- Decision: Decision was made
- Blocker: Something is blocked
- Issue: Problem identified

EPIC ASSIGNMENT:
- If confident about which epic this belongs to, set resolved_epic
- If multiple epics mentioned, list them in epic_mentions
- If uncertain or could be multiple epics, set needs_review: true

ACTION EXTRACTION:
- "follow_up": General task without specific deadline
- "deadline": Task with specific date/time (extract to new_deadlines too)
- "email": Draft email to send

KNOWLEDGE EXTRACTION:
- "tech": Technical information, code details, architecture
- "decision": Decisions made and their rationale
- "process": Process documentation, workflows

Respond ONLY with the JSON object. No markdown, no explanation.`;

/**
 * Build the extraction prompt with context
 */
export function buildExtractionPrompt(context: ExtractionContext): string {
  const sections: string[] = [];

  // JSON Schema section
  sections.push(`JSON SCHEMA (output must match exactly):`);
  sections.push(JSON.stringify(JSON.parse(JSON_SCHEMA), null, 2));

  // Epic context (if available)
  if (context.epicSnapshot) {
    sections.push(`\n--- EPIC CONTEXT ---`);
    sections.push(`Epic: ${context.epicSnapshot.epic.title}`);
    sections.push(`Description: ${context.epicSnapshot.epic.description || 'N/A'}`);
    sections.push(`Aliases: ${context.epicSnapshot.aliases.join(', ') || 'None'}`);
    
    if (context.epicSnapshot.openBlockers.length > 0) {
      sections.push(`\nOpen Blockers:`);
      context.epicSnapshot.openBlockers.forEach(b => {
        sections.push(`- ${b.description}`);
      });
    }
    
    if (context.epicSnapshot.openDependencies.length > 0) {
      sections.push(`\nOpen Dependencies:`);
      context.epicSnapshot.openDependencies.forEach(d => {
        sections.push(`- ${d.description}`);
      });
    }
    
    if (context.epicSnapshot.openIssues.length > 0) {
      sections.push(`\nOpen Issues:`);
      context.epicSnapshot.openIssues.forEach(i => {
        sections.push(`- ${i.description}`);
      });
    }
    
    if (context.epicSnapshot.openActions.length > 0) {
      sections.push(`\nOpen Actions:`);
      context.epicSnapshot.openActions.forEach(a => {
        sections.push(`- [${a.priority}] ${a.title}`);
      });
    }
  }

  // Recent events from this epic
  if (context.recentEvents.length > 0) {
    sections.push(`\n--- RECENT EVENTS FROM THIS EPIC ---`);
    context.recentEvents.forEach(e => {
      sections.push(`Event ${e.id} (${e.createdAt}): ${e.snippet}`);
    });
  }

  // Related knowledge
  if (context.relatedKnowledge.length > 0) {
    sections.push(`\n--- RELATED KNOWLEDGE ---`);
    context.relatedKnowledge.forEach(k => {
      sections.push(`${k.title} [${k.kind}]: ${k.body_md.substring(0, 200)}${k.body_md.length > 200 ? '...' : ''}`);
    });
  }

  // Transcript section
  sections.push(`\n--- TRANSCRIPT TO ANALYZE ---`);
  sections.push(context.transcript);

  return sections.join('\n');
}

/**
 * Build a stricter retry prompt when validation fails
 */
export function buildRetryPrompt(
  originalPrompt: string,
  previousResponse: string,
  validationError: string
): string {
  return `${originalPrompt}

--- PREVIOUS ATTEMPT FAILED ---
Previous response: ${previousResponse}
Validation error: ${validationError}

Please fix the JSON and try again. Ensure:
1. All dates are valid ISO 8601 format (e.g., "2026-02-05T14:00:00+01:00")
2. All required fields are present
3. No extra fields outside the schema
4. Proper JSON syntax (no trailing commas)`;
}

/**
 * Get system prompt
 */
export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Build context for epic snapshot
 */
export async function buildEpicSnapshot(
  epic: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  },
  aliases: string[],
  getActions: (epicId: string) => Promise<Array<{ id: string; title: string; priority: string; completed_at: string | null }>>,
  getBlockers: (epicId: string) => Promise<Array<{ id: string; description: string; status: string }>>,
  getDependencies: (epicId: string) => Promise<Array<{ id: string; description: string; status: string }>>,
  getIssues: (epicId: string) => Promise<Array<{ id: string; description: string; status: string }>>
): Promise<EpicSnapshot> {
  const [actions, blockers, dependencies, issues] = await Promise.all([
    getActions(epic.id),
    getBlockers(epic.id),
    getDependencies(epic.id),
    getIssues(epic.id),
  ]);

  return {
    epic,
    aliases,
    openActions: actions.filter(a => !a.completed_at),
    openBlockers: blockers.filter(b => b.status === 'open'),
    openDependencies: dependencies.filter(d => d.status === 'open'),
    openIssues: issues.filter(i => i.status === 'open'),
  };
}
