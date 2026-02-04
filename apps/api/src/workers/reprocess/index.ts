// Reprocess Worker - Handles forced epic reprocessing

import type { Job, JobResult, ReprocessJobPayload } from '../../queue/types.js';
import { db } from '../../db/connection.js';
import { 
  epicsRepository, 
  actionsRepository, 
  blockersRepository,
  dependenciesRepository,
  issuesRepository,
  knowledgeRepository,
  eventEpicCandidatesRepository,
  eventsRepository,
} from '../../db/repositories/index.js';
import { llmManager, validateExtractionOutput, formatValidationErrors } from '../../llm/index.js';
import { buildExtractionPrompt, buildRetryPrompt, getSystemPrompt } from '../../llm/prompts.js';
import { searchKnowledge } from '../../db/repositories/search.js';
import type { ValidatedExtractionOutput } from '../../llm/schema.js';

const MAX_EXTRACTION_ATTEMPTS = 3;

export class ReprocessWorker {
  readonly type = 'reprocess' as const;

  async process(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    console.log(`[ReprocessWorker] Processing job ${job.id} for event ${job.eventId}`);

    const payload = job.payload as ReprocessJobPayload | null;
    
    if (!payload) {
      return {
        success: false,
        error: 'Missing payload in job',
        retryable: false,
      };
    }

    try {
      // Step 1: Check LLM server health
      if (!llmManager.isServerHealthy()) {
        console.log('[ReprocessWorker] LLM server not healthy, retrying later');
        return {
          success: false,
          error: 'LLM server not available',
          retryable: true,
        };
      }

      // Step 2: Get event
      const event = eventsRepository.findById(job.eventId);
      if (!event) {
        return {
          success: false,
          error: 'Event not found',
          retryable: false,
        };
      }

      if (!event.transcript) {
        return {
          success: false,
          error: 'Event has no transcript',
          retryable: false,
        };
      }

      // Step 3: Load epic if specified
      let epic: { id: string; title: string; description: string | null } | null = null;
      if (payload.epicId) {
        epic = epicsRepository.findById(payload.epicId);
        if (!epic) {
          return {
            success: false,
            error: `Epic ${payload.epicId} not found`,
            retryable: false,
          };
        }
      }

      // Step 4: Build context with forced epic
      const context = await this.buildContext(event.transcript, epic);

      // Step 5: Run LLM extraction with retries
      const extractionResult = await this.runExtractionWithRetries(context);
      
      if (!extractionResult.success) {
        eventsRepository.updateStatus(
          job.eventId,
          'failed',
          `Reprocessing failed: ${extractionResult.error}`
        );

        return {
          success: false,
          error: extractionResult.error,
          retryable: false,
        };
      }

      const output = extractionResult.data;

      // Step 6: Clear existing projections and persist new ones (idempotent)
      await this.persistProjections(job.eventId, output, payload.epicId);

      // Step 7: Mark event as processed
      eventsRepository.updateStatus(job.eventId, 'completed');

      // Step 8: Clear candidates (resolved)
      eventEpicCandidatesRepository.clearForEvent(job.eventId);

      const duration = Date.now() - startTime;
      this.recordRun(job.eventId, 'reprocess',
        { transcript: event.transcript, forcedEpicId: payload.epicId },
        { 
          status: 'completed',
          epicId: payload.epicId,
          actions: output.new_actions.length,
          deadlines: output.new_deadlines.length,
          knowledge: output.knowledge_items.length,
        },
        duration
      );

      console.log(`[ReprocessWorker] Event ${job.eventId} reprocessed successfully in ${duration}ms`);

      return {
        success: true,
        data: {
          status: 'completed',
          epicId: payload.epicId,
          actionsCreated: output.new_actions.length + output.new_deadlines.length,
          knowledgeItems: output.knowledge_items.length,
        },
      };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[ReprocessWorker] Error processing job ${job.id}:`, error);

      return {
        success: false,
        error,
        retryable: true,
      };
    }
  }

  /**
   * Build context for LLM extraction
   */
  private async buildContext(
    transcript: string, 
    epic: { id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string } | null
  ): Promise<{
    transcript: string;
    epicSnapshot?: {
      epic: { id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string };
      aliases: string[];
      openActions: { id: string; title: string; priority: string; completed_at: string | null }[];
      openBlockers: { id: string; description: string; status: string }[];
      openDependencies: { id: string; description: string; status: string }[];
      openIssues: { id: string; description: string; status: string }[];
    };
    recentEvents: { id: string; snippet: string; createdAt: string }[];
    relatedKnowledge: { id: string; title: string; kind: string; body_md: string }[];
  }> {
    const context: Parameters<typeof buildExtractionPrompt>[0] = {
      transcript,
      recentEvents: [],
      relatedKnowledge: [],
    };

    if (epic) {
      // Get epic snapshot
      const aliases = epicsRepository.getAliases(epic.id);
      const [actions, blockers, dependencies, issues] = await Promise.all([
        db.prepare('SELECT * FROM actions WHERE epic_id = ? ORDER BY created_at DESC LIMIT 10').all(epic.id),
        blockersRepository.findByEpicId(epic.id),
        dependenciesRepository.findByEpicId(epic.id),
        issuesRepository.findByEpicId(epic.id),
      ]);

      context.epicSnapshot = {
        epic: epic as { id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string },
        aliases: aliases.map(a => a.alias),
        openActions: actions as { id: string; title: string; priority: string; completed_at: string | null }[],
        openBlockers: blockers as { id: string; description: string; status: string }[],
        openDependencies: dependencies as { id: string; description: string; status: string }[],
        openIssues: issues as { id: string; description: string; status: string }[],
      };

      // Get last 3 events from this epic
      const recentEvents = db.prepare(`
        SELECT e.id, e.transcript, e.created_at 
        FROM events e
        JOIN actions a ON a.source_event_id = e.id
        WHERE a.epic_id = ? AND e.status = 'completed'
        ORDER BY e.created_at DESC
        LIMIT 3
      `).all(epic.id) as Array<{ id: string; transcript: string; created_at: string }>;

      context.recentEvents = recentEvents.map(e => ({
        id: e.id,
        snippet: e.transcript?.substring(0, 200) || '',
        createdAt: e.created_at,
      }));
    }

    // Get related knowledge snippets via FTS
    const searchResults = searchKnowledge(transcript, 5);
    context.relatedKnowledge = searchResults.map(r => ({
      id: r.id,
      title: r.title,
      kind: r.type,
      body_md: r.content,
    }));

    return context;
  }

  /**
   * Run LLM extraction with retry logic
   */
  private async runExtractionWithRetries(context: {
    transcript: string;
    epicSnapshot?: {
      epic: { id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string };
      aliases: string[];
      openActions: { id: string; title: string; priority: string; completed_at: string | null }[];
      openBlockers: { id: string; description: string; status: string }[];
      openDependencies: { id: string; description: string; status: string }[];
      openIssues: { id: string; description: string; status: string }[];
    };
    recentEvents: { id: string; snippet: string; createdAt: string }[];
    relatedKnowledge: { id: string; title: string; kind: string; body_md: string }[];
  }): Promise<{ success: true; data: ValidatedExtractionOutput } | { success: false; error: string }> {
    const userPrompt = buildExtractionPrompt(context);
    const systemPrompt = getSystemPrompt();

    let lastError: string | null = null;
    let lastResponse: string | null = null;

    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt++) {
      try {
        console.log(`[ReprocessWorker] Extraction attempt ${attempt}/${MAX_EXTRACTION_ATTEMPTS}`);

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: attempt === 1 ? userPrompt : buildRetryPrompt(userPrompt, lastResponse || '', lastError || '') },
        ];

        const response = await llmManager.chatCompletions(messages, {
          temperature: 0.1,
          maxTokens: 4096,
        }) as { choices?: Array<{ message?: { content?: string } }> };

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          lastError = 'Empty response from LLM';
          continue;
        }

        lastResponse = content;

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
        }

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          lastError = `JSON parse error: ${e instanceof Error ? e.message : String(e)}`;
          console.warn(`[ReprocessWorker] Attempt ${attempt} JSON parse failed:`, lastError);
          continue;
        }

        // Validate against schema
        const validation = validateExtractionOutput(parsed);
        if (validation.success) {
          console.log(`[ReprocessWorker] Extraction successful on attempt ${attempt}`);
          return { success: true, data: validation.data };
        }

        lastError = formatValidationErrors(validation.errors);
        console.warn(`[ReprocessWorker] Attempt ${attempt} validation failed:`, lastError);

      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[ReprocessWorker] Attempt ${attempt} error:`, lastError);
      }
    }

    return { 
      success: false, 
      error: `Failed after ${MAX_EXTRACTION_ATTEMPTS} attempts. Last error: ${lastError}` 
    };
  }

  /**
   * Persist projections to database (idempotent by source_event_id)
   */
  private async persistProjections(
    eventId: string,
    output: ValidatedExtractionOutput,
    epicId: string | null
  ): Promise<void> {
    // Delete existing projections for this event (idempotency)
    this.clearExistingProjections(eventId);

    // Persist actions
    for (const action of output.new_actions) {
      const created = actionsRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        type: action.type,
        title: action.title,
        body: action.body || null,
        priority: action.priority,
        due_at: action.due_at || null,
      });

      // Add mentions
      for (const name of action.mentions) {
        actionsRepository.addMention(created.id, name);
      }
    }

    // Persist deadlines (also create as actions)
    for (const deadline of output.new_deadlines) {
      actionsRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        type: 'deadline',
        title: deadline.title,
        body: null,
        priority: deadline.priority,
        due_at: deadline.due_at,
      });
    }

    // Persist blockers
    for (const blocker of output.blockers) {
      blockersRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        description: blocker.description,
      });
    }

    // Persist dependencies
    for (const dep of output.dependencies) {
      dependenciesRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        description: dep.description,
      });
    }

    // Persist issues
    for (const issue of output.issues) {
      issuesRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        description: issue.description,
      });
    }

    // Persist knowledge items
    for (const item of output.knowledge_items) {
      knowledgeRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        title: item.title,
        kind: item.kind,
        tags: item.tags,
        body_md: item.body_md,
      });
    }

    // Persist email drafts (as actions with type email)
    for (const email of output.email_drafts) {
      actionsRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        type: 'email',
        title: email.subject,
        body: email.body,
        priority: 'P2',
        due_at: null,
      });
    }

    console.log(`[ReprocessWorker] Persisted projections for event ${eventId}: ${output.new_actions.length} actions, ${output.new_deadlines.length} deadlines, ${output.knowledge_items.length} knowledge, ${output.blockers.length} blockers, ${output.dependencies.length} deps, ${output.issues.length} issues, ${output.email_drafts.length} emails`);
  }

  /**
   * Clear existing projections for an event (idempotency)
   */
  private clearExistingProjections(eventId: string): void {
    db.prepare('DELETE FROM actions WHERE source_event_id = ?').run(eventId);
    db.prepare('DELETE FROM blockers WHERE source_event_id = ?').run(eventId);
    db.prepare('DELETE FROM dependencies WHERE source_event_id = ?').run(eventId);
    db.prepare('DELETE FROM issues WHERE source_event_id = ?').run(eventId);
    db.prepare('DELETE FROM knowledge_items WHERE source_event_id = ?').run(eventId);
    // Mentions are cascaded on action delete
  }

  /**
   * Record reprocess run for observability
   */
  private recordRun(
    eventId: string,
    jobType: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    durationMs: number
  ): void {
    const runId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot, output_snapshot, duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, 'success', ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      runId,
      eventId,
      jobType,
      JSON.stringify(input),
      JSON.stringify(output),
      durationMs
    );
  }
}

export const reprocessWorker = new ReprocessWorker();
