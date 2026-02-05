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

// JSON schema for the extraction output (compact version to reduce truncation)
const JSON_SCHEMA = `{
  "labels": ["EpicUpdate","KnowledgeNote","ActionItem","Decision","Blocker","Issue"],
  "resolved_epic": {"epic_id":"uuid-or-null","confidence":0.8},
  "epic_mentions": [{"name":"string","confidence":0.5}],
  "new_actions": [{"type":"follow_up|deadline|email","title":"string","priority":"P0|P1|P2","due_at":"ISO8601-or-null","mentions":["string"],"body":"string"}],
  "new_deadlines": [{"title":"string","priority":"P0|P1","due_at":"ISO8601"}],
  "blockers": [{"description":"string"}],
  "dependencies": [{"description":"string"}],
  "issues": [{"description":"string"}],
  "knowledge_items": [{"title":"string","kind":"tech|decision|process","tags":["string"],"body_md":"string"}],
  "email_drafts": [{"subject":"string","body":"string"}],
  "needs_review": false,
  "evidence_snippets": ["string"]
}`;

// System prompt for extraction
const SYSTEM_PROMPT = `You are a structured data extractor for a Tech Lead's voice inbox system.

Your task is to analyze voice transcripts and extract structured project information.

CRITICAL RULES:
1. Output MUST be valid, parseable JSON - NO markdown, NO code blocks, NO explanations
2. Output ONLY the JSON object starting with { and ending with }
3. All string values must use double quotes
4. All arrays must be properly closed with ]
5. All objects must be properly closed with }
6. No trailing commas allowed
7. Spanish input is expected - English technical terms may appear mixed in
8. Be conservative - use "needs_review": true if uncertain about epic assignment
9. P0 = urgent/critical, P1 = important, P2 = normal priority
10. Convert relative dates to absolute ISO 8601 datetimes (assume current year 2026)
11. Evidence snippets should be exact quotes from the transcript

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

EXAMPLE OUTPUT FORMAT:
{"labels":["ActionItem"],"resolved_epic":null,"epic_mentions":[],"new_actions":[],"new_deadlines":[],"blockers":[],"dependencies":[],"issues":[],"knowledge_items":[],"email_drafts":[],"needs_review":false,"evidence_snippets":[]}`;

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
  // Truncate previous response if it's too long to avoid context overflow
  const maxPrevLength = 500;
  const truncatedPrev = previousResponse.length > maxPrevLength 
    ? previousResponse.substring(0, maxPrevLength) + '... [truncated]' 
    : previousResponse;

  return `${originalPrompt}

--- PREVIOUS ATTEMPT FAILED ---
Error: ${validationError}
Previous response snippet: ${truncatedPrev}

INSTRUCTIONS FOR RETRY:
1. Output ONLY valid JSON starting with { and ending with }
2. NO markdown code blocks (no \`\`\`json)
3. NO explanatory text before or after the JSON
4. Ensure all strings use double quotes
5. Ensure all arrays end with ]
6. Ensure all objects end with }
7. Remove any trailing commas

If the error was about truncated content, output a valid but possibly incomplete JSON object rather than letting it get cut off mid-token.`;
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
