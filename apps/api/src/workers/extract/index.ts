// Extract Worker - Full LLM extraction pipeline

import type { Job, JobResult, ExtractJobPayload } from '../../queue/types.js';
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
import { enqueueNeedsReviewNotification } from '../../services/push-notifications.js';

const MAX_EXTRACTION_ATTEMPTS = 3;
const EPIC_CONFIDENCE_THRESHOLD = 0.6;
const AMBIGUITY_THRESHOLD = 0.2; // Difference between top 2 scores

export class ExtractWorker {
  readonly type = 'extract' as const;

  async process(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    console.log(`[ExtractWorker] Processing job ${job.id} for event ${job.eventId}`);

    const payload = job.payload as ExtractJobPayload | null;
    
    if (!payload?.transcript) {
      return {
        success: false,
        error: 'Missing transcript in job payload',
        retryable: false,
      };
    }

    try {
      // Step 1: Check LLM server health (with dynamic check as fallback)
      let isHealthy = llmManager.isServerHealthy();
      if (!isHealthy) {
        // Try dynamic health check as fallback
        isHealthy = await llmManager.checkHealth();
        if (isHealthy) {
          console.log('[ExtractWorker] LLM server healthy (dynamic check)');
        }
      }
      if (!isHealthy) {
        console.log('[ExtractWorker] LLM server not healthy, retrying later');
        return {
          success: false,
          error: 'LLM server not available',
          retryable: true,
        };
      }

      // Step 2: Get event and run epic candidate scoring (M5 logic)
      const event = eventsRepository.findById(job.eventId);
      if (!event) {
        return {
          success: false,
          error: 'Event not found',
          retryable: false,
        };
      }

      // Step 3: Score epic candidates
      const candidates = await this.scoreEpicCandidates(payload.transcript);
      console.log(`[ExtractWorker] Found ${candidates.length} epic candidates`);

      // Step 4: Check if needs review (ambiguity detection)
      const needsReview = this.checkNeedsReview(candidates);
      
      if (needsReview.needsReview) {
        // Store candidates for UI disambiguation
        await this.storeCandidates(job.eventId, candidates);
        
        // Mark event as needs_review
        eventsRepository.updateStatus(
          job.eventId, 
          'needs_review', 
          `Ambiguous epic match. Top candidates: ${candidates.slice(0, 3).map(c => c.epic.title).join(', ')}`
        );

        // Enqueue push notification (M8)
        const epicTitles = candidates.slice(0, 3).map(c => c.epic.title);
        enqueueNeedsReviewNotification(job.eventId, epicTitles);

        const duration = Date.now() - startTime;
        this.recordRun(job.eventId, 'extract', 
          { transcript: payload.transcript, candidates: candidates.map(c => ({ id: c.epic.id, title: c.epic.title, score: c.score })) },
          { status: 'needs_review', candidates: candidates.length },
          duration
        );

        return {
          success: true,
          data: {
            status: 'needs_review',
            candidates: candidates.length,
          },
        };
      }

      // Step 4b: No candidates found - extraction will handle via suggested_new_epic

      // Step 5: Build context for LLM
      let resolvedEpic = candidates[0]?.epic || null;
      // Ensure epic has all required fields for the context
      const epicForContext = resolvedEpic ? {
        id: resolvedEpic.id,
        title: resolvedEpic.title,
        description: resolvedEpic.description,
        status: (resolvedEpic as { status?: string }).status || 'active',
        created_at: (resolvedEpic as { created_at?: string }).created_at || new Date().toISOString(),
        updated_at: (resolvedEpic as { updated_at?: string }).updated_at || new Date().toISOString(),
      } : null;
      const context = await this.buildContext(payload.transcript, epicForContext);

      // Step 6: Run LLM extraction with retries
      const extractionResult = await this.runExtractionWithRetries(context);
      
      if (!extractionResult.success) {
        eventsRepository.updateStatus(
          job.eventId,
          'failed',
          `Extraction failed: ${extractionResult.error}`
        );

        return {
          success: false,
          error: extractionResult.error,
          retryable: false,
        };
      }

      const output = extractionResult.data;

      // DEBUG: Log the full output to see what LLM returned
      console.log('[ExtractWorker] LLM Output:', JSON.stringify({
        resolved_epic: output.resolved_epic,
        suggested_new_epic: output.suggested_new_epic,
        needs_review: output.needs_review,
        new_actions_count: output.new_actions.length,
      }, null, 2));

      // Step 7: Auto-create epic if suggested by LLM (even if needs_review is true)
      if (output.suggested_new_epic && !resolvedEpic) {
        console.log(`[ExtractWorker] Auto-creating epic: ${output.suggested_new_epic.title}`);
        const newEpic = epicsRepository.create(
          output.suggested_new_epic.title,
          output.suggested_new_epic.description
        );
        
        // Add aliases if provided
        if (output.suggested_new_epic.aliases?.length > 0) {
          for (const alias of output.suggested_new_epic.aliases) {
            epicsRepository.addAlias(newEpic.id, alias);
          }
        }
        
        resolvedEpic = newEpic;
        console.log(`[ExtractWorker] Created epic ${newEpic.id}: ${newEpic.title}`);
      }
      
      // Step 7c: Fallback - Extract epic from action titles if LLM didn't suggest one
      // Look for patterns like "CP39", "Project X", etc. in action titles
      if (!resolvedEpic && !output.suggested_new_epic && output.new_actions.length > 0) {
        const epicPattern = /(?:CP|EP|Project|Proyecto)\s*(\d+|[A-Z][a-zA-Z]+)/gi;
        const matches: string[] = [];
        
        for (const action of output.new_actions) {
          const titleMatches = action.title.match(epicPattern);
          if (titleMatches) {
            matches.push(...titleMatches);
          }
          if (action.body) {
            const bodyMatches = action.body.match(epicPattern);
            if (bodyMatches) {
              matches.push(...bodyMatches);
            }
          }
        }
        
        if (matches.length > 0) {
          // Get most frequent match
          const matchCounts = matches.reduce((acc, m) => {
            const normalized = m.toUpperCase().replace(/\s+/g, '');
            acc[normalized] = (acc[normalized] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          const bestMatch = Object.entries(matchCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0];
          
          if (bestMatch) {
            console.log(`[ExtractWorker] Fallback: Creating epic from action titles: ${bestMatch}`);
            const epicTitle = bestMatch.match(/^(CP|EP|PROJECT)/i) 
              ? bestMatch.toUpperCase()
              : `Project ${bestMatch}`;
            
            const newEpic = epicsRepository.create(
              epicTitle,
              `Epic auto-extracted from voice recording`
            );
            epicsRepository.addAlias(newEpic.id, bestMatch);
            
            resolvedEpic = newEpic;
            console.log(`[ExtractWorker] Created fallback epic ${newEpic.id}: ${newEpic.title}`);
          }
        }
      }

      // Step 7b: If extraction marked needs_review and NO epic (existing or new)
      if (output.needs_review && !resolvedEpic) {
        await this.storeCandidates(job.eventId, candidates);
        eventsRepository.updateStatus(job.eventId, 'needs_review', 'LLM flagged for review');
        
        const duration = Date.now() - startTime;
        this.recordRun(job.eventId, 'extract',
          { transcript: payload.transcript },
          { status: 'needs_review', llmFlagged: true },
          duration
        );

        return {
          success: true,
          data: {
            status: 'needs_review',
            llmFlagged: true,
          },
        };
      }

      // Step 8: Persist projections (idempotent by source_event_id)
      await this.persistProjections(job.eventId, output, resolvedEpic?.id || null);

      // Step 9: Mark event as processed
      eventsRepository.updateStatus(job.eventId, 'completed');

      const duration = Date.now() - startTime;
      this.recordRun(job.eventId, 'extract',
        { transcript: payload.transcript, length: payload.transcript.length },
        { 
          status: 'completed',
          actions: output.new_actions.length,
          deadlines: output.new_deadlines.length,
          knowledge: output.knowledge_items.length,
          blockers: output.blockers.length,
        },
        duration
      );

      console.log(`[ExtractWorker] Event ${job.eventId} processed successfully in ${duration}ms`);

      return {
        success: true,
        data: {
          status: 'completed',
          epicId: output.resolved_epic?.epic_id || null,
          actionsCreated: output.new_actions.length + output.new_deadlines.length,
          knowledgeItems: output.knowledge_items.length,
        },
      };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[ExtractWorker] Error processing job ${job.id}:`, error);

      return {
        success: false,
        error,
        retryable: true,
      };
    }
  }

  /**
   * Score epic candidates using aliases + FTS5
   */
  private async scoreEpicCandidates(transcript: string): Promise<Array<{ epic: { id: string; title: string; description: string | null }; score: number }>> {
    const candidates: Array<{ epic: { id: string; title: string; description: string | null }; score: number }> = [];

    // Step A: Check for exact alias matches
    const words = transcript.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/[^a-z0-9]/g, '');
      if (cleanWord.length < 2) continue;

      const epic = epicsRepository.findByAlias(cleanWord);
      if (epic) {
        // Check if already in candidates
        const existing = candidates.find(c => c.epic.id === epic.id);
        if (existing) {
          existing.score = Math.max(existing.score, 1.0);
        } else {
          candidates.push({ epic, score: 1.0 });
        }
      }
    }

    // Step B: FTS5 ranking for top 3
    const ftsResults = epicsRepository.findCandidates(transcript, 3);
    for (const result of ftsResults) {
      const existing = candidates.find(c => c.epic.id === result.epic.id);
      if (existing) {
        // Boost score if also found by FTS
        existing.score = Math.max(existing.score, 0.8 - result.score * 0.1);
      } else {
        candidates.push({ 
          epic: result.epic, 
          score: Math.max(0, 0.8 - result.score * 0.1) // bm25 returns lower = better
        });
      }
    }

    // Sort by score descending
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Check if event needs human review for epic disambiguation
   */
  private checkNeedsReview(candidates: Array<{ score: number }>): { needsReview: boolean; reason?: string } {
    // No candidates found
    if (candidates.length === 0) {
      return { needsReview: false }; // No epic, process as standalone
    }

    // Only one candidate with high confidence
    if (candidates.length === 1 && candidates[0].score >= EPIC_CONFIDENCE_THRESHOLD) {
      return { needsReview: false };
    }

    // Multiple candidates - check if top one is clearly best
    if (candidates.length >= 2) {
      const diff = candidates[0].score - candidates[1].score;
      if (diff >= AMBIGUITY_THRESHOLD && candidates[0].score >= EPIC_CONFIDENCE_THRESHOLD) {
        return { needsReview: false };
      }
    }

    // Top candidate has low confidence
    if (candidates[0].score < EPIC_CONFIDENCE_THRESHOLD) {
      return { needsReview: true, reason: 'Low confidence in epic match' };
    }

    // Ambiguous between top candidates
    return { needsReview: true, reason: 'Ambiguous epic match' };
  }

  /**
   * Store epic candidates for UI disambiguation
   */
  private async storeCandidates(
    eventId: string, 
    candidates: Array<{ epic: { id: string }; score: number }>
  ): Promise<void> {
    // Clear existing candidates
    eventEpicCandidatesRepository.clearForEvent(eventId);

    // Store new candidates
    for (let i = 0; i < Math.min(candidates.length, 3); i++) {
      eventEpicCandidatesRepository.create(
        eventId,
        candidates[i].epic.id,
        candidates[i].score,
        i + 1
      );
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
        WHERE a.epic_id = ? AND e.id != ?
        ORDER BY e.created_at DESC
        LIMIT 3
      `).all(epic.id, 'current-event-id') as Array<{ id: string; transcript: string; created_at: string }>;

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

  // Maximum transcript length for extraction (characters)
  private readonly MAX_TRANSCRIPT_LENGTH = 8000;

  /**
   * Truncate transcript if too long, keeping beginning and end
   */
  private truncateTranscript(transcript: string): string {
    if (transcript.length <= this.MAX_TRANSCRIPT_LENGTH) {
      return transcript;
    }

    const keepLength = Math.floor(this.MAX_TRANSCRIPT_LENGTH / 2);
    const beginning = transcript.slice(0, keepLength);
    const end = transcript.slice(-keepLength);
    
    console.log(`[ExtractWorker] Transcript truncated from ${transcript.length} to ${beginning.length + end.length + 50} chars`);
    
    return `${beginning}\n\n[... ${transcript.length - (keepLength * 2)} characters truncated ...]\n\n${end}`;
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
    // Truncate transcript if too long
    const truncatedContext = {
      ...context,
      transcript: this.truncateTranscript(context.transcript),
    };

    const userPrompt = buildExtractionPrompt(truncatedContext);
    const systemPrompt = getSystemPrompt();

    let lastError: string | null = null;
    let lastResponse: string | null = null;

    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt++) {
      try {
        console.log(`[ExtractWorker] Extraction attempt ${attempt}/${MAX_EXTRACTION_ATTEMPTS}`);

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: attempt === 1 ? userPrompt : buildRetryPrompt(userPrompt, lastResponse || '', lastError || '') },
        ];

        // DEBUG: Log the prompt being sent
        console.log(`[ExtractWorker] Sending prompt (${messages[1].content.length} chars)`);

        // LLMManager will calculate dynamic timeout based on content length
        // Base timeout: 5min, scales with content, max 20min
        const response = await llmManager.chatCompletions(messages, {
          temperature: 0.1,
          maxTokens: 4096,
          responseFormat: { type: 'json_object' },
        }) as { choices?: Array<{ message?: { content?: string } }> };

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          lastError = 'Empty response from LLM';
          continue;
        }

        // DEBUG: Log full raw response with clear markers
        console.log('[ExtractWorker] === RAW LLM RESPONSE START ===');
        console.log(content);
        console.log('[ExtractWorker] === RAW LLM RESPONSE END ===');
        console.log(`[ExtractWorker] Response length: ${content.length} chars`);

        lastResponse = content;

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
          console.log(`[ExtractWorker] Extracted JSON from code block (${jsonStr.length} chars)`);
        }

        // Try to repair truncated JSON
        const originalJsonStr = jsonStr;
        jsonStr = this.repairJson(jsonStr);
        if (jsonStr !== originalJsonStr) {
          console.log(`[ExtractWorker] JSON was repaired`);
        }

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
          console.log(`[ExtractWorker] JSON parsed successfully`);
        } catch (e) {
          lastError = `JSON parse error: ${e instanceof Error ? e.message : String(e)}`;
          console.warn(`[ExtractWorker] Attempt ${attempt} JSON parse failed:`, lastError);
          console.warn(`[ExtractWorker] JSON content (first 1000 chars):`, jsonStr.substring(0, 1000));
          console.warn(`[ExtractWorker] JSON content (last 500 chars):`, jsonStr.slice(-500));
          continue;
        }

        // Validate against schema
        const validation = validateExtractionOutput(parsed);
        if (validation.success) {
          console.log(`[ExtractWorker] Extraction successful on attempt ${attempt}`);
          return { success: true, data: validation.data };
        }

        lastError = formatValidationErrors(validation.errors);
        console.warn(`[ExtractWorker] Attempt ${attempt} validation failed:`, lastError);

      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[ExtractWorker] Attempt ${attempt} error:`, lastError);
      }
    }

    return { 
      success: false, 
      error: `Failed after ${MAX_EXTRACTION_ATTEMPTS} attempts. Last error: ${lastError}` 
    };
  }

  /**
   * Attempt to repair truncated/malformed JSON from LLM
   * Handles truncation mid-token, incomplete strings, missing braces, etc.
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr.trim();

    // Remove any text before the first {
    const firstBrace = repaired.indexOf('{');
    if (firstBrace > 0) {
      repaired = repaired.slice(firstBrace);
    }

    // Remove any text after the last } (but be careful about strings)
    // Only trim if the last } is not inside a string
    const lastBrace = this.findLastUnquotedBrace(repaired);
    if (lastBrace !== -1 && lastBrace < repaired.length - 1) {
      repaired = repaired.slice(0, lastBrace + 1);
    }

    // Fix incomplete strings (unclosed quotes)
    repaired = this.fixIncompleteStrings(repaired);

    // Balance braces - count opening and closing
    let openBraces = 0;
    let closeBraces = 0;
    for (const char of repaired) {
      if (char === '{') openBraces++;
      if (char === '}') closeBraces++;
    }

    // Add missing closing braces
    while (closeBraces < openBraces) {
      repaired += '}';
      closeBraces++;
    }

    // Balance brackets for arrays
    let openBrackets = 0;
    let closeBrackets = 0;
    for (const char of repaired) {
      if (char === '[') openBrackets++;
      if (char === ']') closeBrackets++;
    }
    while (closeBrackets < openBrackets) {
      // Find the last unquoted [ and close it appropriately
      const lastOpen = this.findLastUnquotedBracket(repaired);
      if (lastOpen !== -1) {
        // Determine context: are we inside an object or at root?
        const context = this.getContextAtPosition(repaired, lastOpen);
        if (context === 'object') {
          // Close array then close object
          repaired = repaired.slice(0, repaired.length - (openBraces - closeBraces)) + ']}' + '}'.repeat(Math.max(0, openBraces - closeBraces - 1));
        } else {
          repaired += ']';
        }
      } else {
        repaired += ']';
      }
      closeBrackets++;
    }

    // Fix trailing commas before closing braces/brackets
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // Handle truncated values - if ends mid-token, close the value properly
    repaired = this.fixTruncatedValues(repaired);

    return repaired;
  }

  /**
   * Find the last } that is not inside a string
   */
  private findLastUnquotedBrace(str: string): number {
    let inString = false;
    let escapeNext = false;
    let lastBrace = -1;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !inString) {
        inString = true;
      } else if (char === '"' && inString) {
        inString = false;
      } else if (char === '}' && !inString) {
        lastBrace = i;
      }
    }
    return lastBrace;
  }

  /**
   * Find the last [ that is not inside a string
   */
  private findLastUnquotedBracket(str: string): number {
    let inString = false;
    let escapeNext = false;

    for (let i = str.length - 1; i >= 0; i--) {
      const char = str[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !inString) {
        inString = true;
      } else if (char === '"' && inString) {
        inString = false;
      } else if (char === '[' && !inString) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get context (object/array) at a given position
   */
  private getContextAtPosition(str: string, pos: number): 'object' | 'array' | 'unknown' {
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < pos && i < str.length; i++) {
      const char = str[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !inString) {
        inString = true;
      } else if (char === '"' && inString) {
        inString = false;
      } else if (!inString) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
        if (char === '[') bracketDepth++;
        if (char === ']') bracketDepth--;
      }
    }

    if (braceDepth > 0) return 'object';
    if (bracketDepth > 0) return 'array';
    return 'unknown';
  }

  /**
   * Fix incomplete/unclosed strings in JSON
   */
  private fixIncompleteStrings(str: string): string {
    let inString = false;
    let escapeNext = false;
    let lastQuoteStart = -1;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        if (!inString) {
          inString = true;
          lastQuoteStart = i;
        } else {
          inString = false;
        }
      }
    }

    // If still in a string at the end, close it
    if (inString) {
      // Check if we're mid-escape
      if (str[str.length - 1] === '\\') {
        // Remove the trailing backslash and close the string
        str = str.slice(0, -1) + '"';
      } else {
        str += '"';
      }
    }

    return str;
  }

  /**
   * Fix truncated values that end mid-token
   * e.g., "labels": ["Acti  -> "labels": []
   */
  private fixTruncatedValues(str: string): string {
    // If the string ends with a partial token inside quotes, close it
    // Pattern: "key": "partial  or  "key": ["partial  or  "key": "value", "partial
    const partialStringMatch = str.match(/"[^"]*$/);
    if (partialStringMatch) {
      // There's an unclosed string at the end
      // Find the start of this string and determine context
      const lastQuote = str.lastIndexOf('"', str.length - 2);
      if (lastQuote !== -1) {
        const beforeQuote = str.slice(0, lastQuote).trim();
        // Check if this is a key or a value
        if (beforeQuote.endsWith(':') || beforeQuote.endsWith('[') || beforeQuote.endsWith(',')) {
          // It's a value string that's incomplete - remove the partial content
          str = str.slice(0, lastQuote);
          // Add appropriate closing based on context
          if (beforeQuote.endsWith('[')) {
            str += ']';
          }
        }
      }
    }

    // Handle case where we're mid-array item without starting quote
    // e.g., "labels": [Acti  -> "labels": []
    const partialArrayItem = str.match(/:\s*\[\s*([a-zA-Z_]+)$/);
    if (partialArrayItem) {
      // Remove the partial token and close the array
      str = str.replace(/:\s*\[\s*[a-zA-Z_]+$/, ': []');
    }

    return str;
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
      const created = actionsRepository.create({
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
        owner: blocker.owner || null,
        eta: blocker.eta || null,
      });
    }

    // Persist dependencies
    for (const dep of output.dependencies) {
      dependenciesRepository.create({
        source_event_id: eventId,
        epic_id: epicId,
        description: dep.description,
        owner: dep.owner || null,
        eta: dep.eta || null,
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

    console.log(`[ExtractWorker] Persisted projections for event ${eventId}: ${output.new_actions.length} actions, ${output.new_deadlines.length} deadlines, ${output.knowledge_items.length} knowledge, ${output.blockers.length} blockers, ${output.dependencies.length} deps, ${output.issues.length} issues, ${output.email_drafts.length} emails`);
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
   * Record extraction run for observability
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

export const extractWorker = new ExtractWorker();
