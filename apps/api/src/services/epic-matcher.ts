// Epic matching service - implements "epics-first" retrieval algorithm
// See PRD Section 11 for algorithm details

import { db } from '../db/connection.js';

export interface EpicCandidate {
  epicId: string;
  title: string;
  confidence: number;
  matchType: 'exact' | 'fts';
}

export interface EpicMatchResult {
  candidates: EpicCandidate[];
  needsReview: boolean;
  topConfidence: number;
  confidenceGap: number;
}

// Threshold for ambiguity detection (PRD: if top1 - top2 < threshold → needs_review)
const AMBIGUITY_THRESHOLD = 0.2;

// Confidence scores by match type
const CONFIDENCE = {
  EXACT_ALIAS: 0.95,
  FTS_PRIMARY: 0.8,
  FTS_SECONDARY: 0.6,
  FTS_TERTIARY: 0.4,
};

interface EpicRow {
  id: string;
  title: string;
}

interface AliasRow {
  epic_id: string;
  title: string;
}

/**
 * Normalize text for matching (lowercase, trim, remove extra spaces)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Step A: Try exact alias match via epic_aliases.alias_norm
 */
function findExactAliasMatch(query: string): AliasRow | null {
  const normalizedQuery = normalizeText(query);
  
  // Try to find an exact match on normalized alias
  const row = db.prepare(`
    SELECT ea.epic_id, e.title
    FROM epic_aliases ea
    JOIN epics e ON ea.epic_id = e.id
    WHERE ea.alias_norm = ? AND e.status = 'active'
  `).get(normalizedQuery) as AliasRow | undefined;
  
  return row || null;
}

/**
 * Step B: FTS5 search on epics.title + aliases, return top 3
 */
function findFtsMatches(query: string, limit: number = 3): Array<{ id: string; title: string; rank: number }> {
  // Search in both epics and epic_aliases via the search_fts index
  // Note: We need to ensure epics are in the FTS index
  const rows = db.prepare(`
    SELECT DISTINCT e.id, e.title, rank
    FROM search_fts s
    JOIN epics e ON s.content_id = e.id
    WHERE search_fts MATCH ?
      AND s.content_type = 'epic'
      AND e.status = 'active'
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<{ id: string; title: string; rank: number }>;
  
  return rows;
}

/**
 * Calculate confidence based on match type and rank
 */
function calculateConfidence(matchType: 'exact' | 'fts', rank: number = 0): number {
  if (matchType === 'exact') {
    return CONFIDENCE.EXACT_ALIAS;
  }
  
  // For FTS matches, confidence decreases with rank
  // rank from FTS5 is usually negative (lower is better)
  const absRank = Math.abs(rank);
  
  if (absRank < 1) {
    return CONFIDENCE.FTS_PRIMARY;
  } else if (absRank < 3) {
    return CONFIDENCE.FTS_SECONDARY;
  } else {
    return CONFIDENCE.FTS_TERTIARY;
  }
}

/**
 * Main epic matching function
 * Implements the epics-first retrieval algorithm from PRD Section 11
 */
export function findEpicCandidates(
  query: string,
  options: { limit?: number; threshold?: number } = {}
): EpicMatchResult {
  const limit = options.limit || 3;
  const threshold = options.threshold || AMBIGUITY_THRESHOLD;
  
  const candidates: EpicCandidate[] = [];
  
  // Step 1: Try exact alias match
  const exactMatch = findExactAliasMatch(query);
  if (exactMatch) {
    candidates.push({
      epicId: exactMatch.epic_id,
      title: exactMatch.title,
      confidence: CONFIDENCE.EXACT_ALIAS,
      matchType: 'exact',
    });
  }
  
  // Step 2: If no exact match, use FTS5 to find top candidates
  if (candidates.length === 0) {
    const ftsMatches = findFtsMatches(query, limit);
    
    for (let i = 0; i < ftsMatches.length; i++) {
      const match = ftsMatches[i];
      const confidence = calculateConfidence('fts', match.rank);
      
      candidates.push({
        epicId: match.id,
        title: match.title,
        confidence: confidence * (1 - i * 0.1), // Slight decay for lower ranks
        matchType: 'fts',
      });
    }
  }
  
  // Step 3: Calculate if needs review based on confidence gap
  let needsReview = false;
  let topConfidence = 0;
  let confidenceGap = 0;
  
  if (candidates.length >= 2) {
    topConfidence = candidates[0].confidence;
    const secondConfidence = candidates[1].confidence;
    confidenceGap = topConfidence - secondConfidence;
    needsReview = confidenceGap < threshold;
  } else if (candidates.length === 1) {
    topConfidence = candidates[0].confidence;
    confidenceGap = topConfidence; // Gap is from top to nothing
    // Single candidate with medium confidence might still need review
    needsReview = topConfidence < CONFIDENCE.FTS_PRIMARY;
  } else {
    // No candidates found
    needsReview = true;
  }
  
  return {
    candidates,
    needsReview,
    topConfidence,
    confidenceGap,
  };
}

/**
 * Store candidates in the database for later review
 */
export function storeEpicCandidates(eventId: string, candidates: EpicCandidate[]): void {
  // Clear any existing candidates for this event
  db.prepare('DELETE FROM event_epic_candidates WHERE event_id = ?').run(eventId);
  
  // Insert new candidates
  const insertStmt = db.prepare(`
    INSERT INTO event_epic_candidates (id, event_id, epic_id, score, rank, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  const transaction = db.transaction(() => {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      insertStmt.run(
        crypto.randomUUID(),
        eventId,
        candidate.epicId,
        candidate.confidence,
        i + 1 // 1-based rank
      );
    }
  });
  
  transaction();
}

/**
 * Get stored candidates for an event
 */
export function getStoredCandidates(eventId: string): Array<{
  epicId: string;
  title: string;
  confidence: number;
  rank: number;
}> {
  const rows = db.prepare(`
    SELECT c.epic_id, e.title, c.score, c.rank
    FROM event_epic_candidates c
    JOIN epics e ON c.epic_id = e.id
    WHERE c.event_id = ?
    ORDER BY c.rank ASC
  `).all(eventId) as Array<{
    epic_id: string;
    title: string;
    score: number;
    rank: number;
  }>;
  
  return rows.map(row => ({
    epicId: row.epic_id,
    title: row.title,
    confidence: row.score,
    rank: row.rank,
  }));
}

/**
 * Get epic snapshot for LLM context
 * Includes: blockers, dependencies, issues, recent actions, aliases
 */
interface ResolvedItem {
  id: string;
  description: string;
  status: string;
  resolvedAt: string | null;
  createdAt: string;
  owner: string | null;
}

export function getEpicSnapshot(epicId: string): {
  epic: { id: string; title: string; description: string | null };
  aliases: string[];
  blockers: Array<{ id: string; description: string; status: string }>;
  dependencies: Array<{ id: string; description: string; status: string }>;
  issues: Array<{ id: string; description: string; status: string }>;
  recentActions: Array<{ type: string; title: string; priority: string; completed: boolean }>;
  history: {
    resolvedBlockers: ResolvedItem[];
    resolvedDependencies: ResolvedItem[];
    resolvedIssues: ResolvedItem[];
    completedActions: Array<{ id: string; title: string; type: string; priority: string; completedAt: string }>;
  };
} | null {
  const epic = db.prepare('SELECT id, title, description FROM epics WHERE id = ?').get(epicId) as
    | { id: string; title: string; description: string | null }
    | undefined;
  
  if (!epic) return null;
  
  const aliases = db.prepare('SELECT alias FROM epic_aliases WHERE epic_id = ?').all(epicId) as Array<{ alias: string }>;
  
  const blockers = db.prepare(`
    SELECT id, description, status FROM blockers
    WHERE epic_id = ? AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(epicId) as Array<{ id: string; description: string; status: string }>;

  const dependencies = db.prepare(`
    SELECT id, description, status FROM dependencies
    WHERE epic_id = ? AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(epicId) as Array<{ id: string; description: string; status: string }>;

  const issues = db.prepare(`
    SELECT id, description, status FROM issues
    WHERE epic_id = ? AND status = 'open'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(epicId) as Array<{ id: string; description: string; status: string }>;
  
  const recentActions = db.prepare(`
    SELECT type, title, priority, completed_at IS NOT NULL as completed
    FROM actions
    WHERE epic_id = ? AND completed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `).all(epicId) as Array<{ type: string; title: string; priority: string; completed: number }>;

  // History: resolved blockers
  const resolvedBlockers = db.prepare(`
    SELECT id, description, status, resolved_at, created_at, owner FROM blockers
    WHERE epic_id = ? AND status = 'resolved'
    ORDER BY resolved_at DESC
    LIMIT 20
  `).all(epicId) as Array<{ id: string; description: string; status: string; resolved_at: string | null; created_at: string; owner: string | null }>;

  // History: resolved dependencies
  const resolvedDeps = db.prepare(`
    SELECT id, description, status, resolved_at, created_at, owner FROM dependencies
    WHERE epic_id = ? AND status = 'resolved'
    ORDER BY resolved_at DESC
    LIMIT 20
  `).all(epicId) as Array<{ id: string; description: string; status: string; resolved_at: string | null; created_at: string; owner: string | null }>;

  // History: resolved issues (issues table doesn't have owner column)
  const resolvedIssues = db.prepare(`
    SELECT id, description, status, resolved_at, created_at FROM issues
    WHERE epic_id = ? AND status = 'resolved'
    ORDER BY resolved_at DESC
    LIMIT 20
  `).all(epicId) as Array<{ id: string; description: string; status: string; resolved_at: string | null; created_at: string }>;

  // History: completed actions
  const completedActions = db.prepare(`
    SELECT id, title, type, priority, completed_at FROM actions
    WHERE epic_id = ? AND completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 20
  `).all(epicId) as Array<{ id: string; title: string; type: string; priority: string; completed_at: string }>;

  return {
    epic,
    aliases: aliases.map(a => a.alias),
    blockers,
    dependencies,
    issues,
    recentActions: recentActions.map(a => ({
      ...a,
      completed: Boolean(a.completed),
    })),
    history: {
      resolvedBlockers: resolvedBlockers.map(b => ({
        id: b.id, description: b.description, status: b.status,
        resolvedAt: b.resolved_at, createdAt: b.created_at, owner: b.owner,
      })),
      resolvedDependencies: resolvedDeps.map(d => ({
        id: d.id, description: d.description, status: d.status,
        resolvedAt: d.resolved_at, createdAt: d.created_at, owner: d.owner,
      })),
      resolvedIssues: resolvedIssues.map(i => ({
        id: i.id, description: i.description, status: i.status,
        resolvedAt: i.resolved_at, createdAt: i.created_at, owner: null,
      })),
      completedActions: completedActions.map(a => ({
        id: a.id, title: a.title, type: a.type, priority: a.priority,
        completedAt: a.completed_at,
      })),
    },
  };
}

/**
 * Find epic by ID
 */
export function findEpicById(epicId: string): { id: string; title: string; description: string | null; status: string } | null {
  const row = db.prepare('SELECT id, title, description, status FROM epics WHERE id = ?').get(epicId) as
    | { id: string; title: string; description: string | null; status: string }
    | undefined;
  return row || null;
}
