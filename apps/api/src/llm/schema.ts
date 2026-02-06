// Zod schemas for LLM extraction output validation
import { z } from 'zod';
import type {
  ExtractorAction,
  ExtractorDeadline,
  ExtractorBlocker,
  ExtractorDependency,
  ExtractorIssue,
  ExtractorKnowledgeItem,
  ExtractorEmailDraft,
  ExtractorOutput,
} from '@tl-voice-inbox/shared';

// Priority enum
const PrioritySchema = z.enum(['P0', 'P1', 'P2']);

// Action type enum
const ActionTypeSchema = z.enum(['follow_up', 'deadline', 'email']);

// Knowledge kind enum
const KnowledgeKindSchema = z.enum(['tech', 'decision', 'process']);

// Epic reference schema
const EpicReferenceSchema = z.object({
  epic_id: z.string(),
  confidence: z.number().min(0).max(1),
});

// Epic mention schema (for partial matches)
const EpicMentionSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

// Action schema
const ActionSchema = z.object({
  type: ActionTypeSchema,
  title: z.string().min(1).max(500),
  priority: PrioritySchema,
  due_at: z.string().datetime().nullable().optional(),
  mentions: z.array(z.string()).default([]),
  body: z.union([z.string(), z.null()]).transform(val => val ?? '').default(''),
});

// Deadline schema (for P0/P1 deadlines)
const DeadlineSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z.enum(['P0', 'P1']),
  due_at: z.string().datetime(),
});

// Blocker schema
const BlockerSchema = z.object({
  description: z.string().min(1).max(2000),
  status: z.enum(['open']).default('open'),
});

// Dependency schema
const DependencySchema = z.object({
  description: z.string().min(1).max(2000),
  status: z.enum(['open']).default('open'),
});

// Issue schema
const IssueSchema = z.object({
  description: z.string().min(1).max(2000),
  status: z.enum(['open']).default('open'),
});

// Knowledge item schema
const KnowledgeItemSchema = z.object({
  title: z.string().min(1).max(500),
  kind: KnowledgeKindSchema,
  tags: z.array(z.string()).default([]),
  body_md: z.union([z.string(), z.null()]).transform(val => val ?? '').default(''),
});

// Email draft schema
const EmailDraftSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.union([z.string(), z.null()]).transform(val => val ?? '').default(''),
});

// Suggested new epic schema (for auto-creation)
const SuggestedNewEpicSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  aliases: z.array(z.string()).default([]),
});

// Main extraction output schema
export const ExtractionOutputSchema = z.object({
  labels: z.array(z.string()).default([]),
  resolved_epic: EpicReferenceSchema.nullable().default(null),
  epic_mentions: z.array(EpicMentionSchema).default([]),
  suggested_new_epic: SuggestedNewEpicSchema.nullable().optional(),
  new_actions: z.array(ActionSchema).default([]),
  new_deadlines: z.array(DeadlineSchema).default([]),
  blockers: z.array(BlockerSchema).default([]),
  dependencies: z.array(DependencySchema).default([]),
  issues: z.array(IssueSchema).default([]),
  knowledge_items: z.array(KnowledgeItemSchema).default([]),
  email_drafts: z.array(EmailDraftSchema).default([]),
  needs_review: z.boolean().default(false),
  evidence_snippets: z.array(z.string()).default([]),
});

// Export type
export type ValidatedExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

// Validate extraction output
export function validateExtractionOutput(data: unknown): { 
  success: true; 
  data: ValidatedExtractionOutput;
} | { 
  success: false; 
  errors: z.ZodError;
} {
  const result = ExtractionOutputSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}

// Get validation errors as readable string
export function formatValidationErrors(errors: z.ZodError): string {
  return errors.errors.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// Retry counter for extraction attempts
export interface ExtractionAttempt {
  attempt: number;
  maxAttempts: number;
  rawResponse: string | null;
  parsedData: unknown | null;
  validationError: string | null;
}
