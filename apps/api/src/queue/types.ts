// Shared types for job queue and workers

export type JobType = 'stt' | 'extract' | 'reprocess' | 'push';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retry';

export interface Job {
  id: string;
  eventId: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SttJobPayload {
  audioPath: string;
  language?: string;
}

export interface ExtractJobPayload {
  transcript: string;
}

export interface ReprocessJobPayload {
  epicId: string | null;
}

export interface PushJobPayload {
  subscriptionId: string;
  notificationType: string;
  title: string;
  body: string;
}

export type JobResult = {
  success: true;
  data?: Record<string, unknown>;
} | {
  success: false;
  error: string;
  retryable?: boolean;
};

export interface Worker {
  type: JobType;
  process(job: Job): Promise<JobResult>;
}
