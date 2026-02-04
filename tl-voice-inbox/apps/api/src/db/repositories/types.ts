// Extended types for repositories (parsed JSON fields)

import type { Job as SharedJob } from '@tl-voice-inbox/shared';

export interface JobWithParsedPayload extends Omit<SharedJob, 'payload'> {
  payload: Record<string, unknown> | null;
}
