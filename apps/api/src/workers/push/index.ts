// Push Worker - Sends Web Push notifications

import type { Job, JobResult, PushJobPayload } from '../../queue/types.js';
import { db } from '../../db/connection.js';
import { pushSubscriptionsRepository } from '../../db/repositories/index.js';
import { sendToSubscription, isPushServiceReady } from '../../services/push.js';

// Maximum retry attempts for push notifications
const MAX_PUSH_RETRIES = 3;

// Retry delays in milliseconds (exponential backoff)
const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

export interface PushNotification {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, unknown>;
}

export class PushWorker {
  readonly type = 'push' as const;

  async process(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    console.log(`[PushWorker] Processing job ${job.id} for event ${job.eventId}`);

    if (!isPushServiceReady()) {
      return {
        success: false,
        error: 'Push service not initialized. VAPID keys not configured.',
        retryable: false,
      };
    }

    const payload = job.payload as PushJobPayload | null;
    
    if (!payload) {
      return {
        success: false,
        error: 'Missing payload in push job',
        retryable: false,
      };
    }

    // Validate required fields
    if (!payload.subscriptionId) {
      return {
        success: false,
        error: 'Missing subscriptionId in payload',
        retryable: false,
      };
    }

    try {
      // Get subscription from database
      const subscription = pushSubscriptionsRepository.findById(payload.subscriptionId);
      
      if (!subscription) {
        console.warn(`[PushWorker] Subscription ${payload.subscriptionId} not found`);
        return {
          success: false,
          error: `Subscription ${payload.subscriptionId} not found`,
          retryable: false,
        };
      }

      // Build notification based on type
      const notification = this.buildNotification(payload);

      // Send push with retry logic
      const result = await this.sendPushWithRetry(subscription, notification);

      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(`[PushWorker] Push sent successfully in ${duration}ms`);
        
        // Record the push run
        this.recordRun(job.eventId, 'push', payload, { success: true }, duration);

        return {
          success: true,
          data: {
            subscriptionId: payload.subscriptionId,
            notificationType: payload.notificationType,
            durationMs: duration,
          },
        };
      } else {
        console.error(`[PushWorker] Push failed after retries: ${result.error}`);
        
        this.recordRun(job.eventId, 'push', payload, { success: false, error: result.error }, duration);

        return {
          success: false,
          error: result.error || 'Push failed',
          retryable: result.retryable,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[PushWorker] Error processing job ${job.id}:`, error);

      return {
        success: false,
        error,
        retryable: true,
      };
    }
  }

  /**
   * Build notification payload based on notification type
   */
  private buildNotification(payload: PushJobPayload): { title: string; body: string; tag: string; url?: string } {
    const url = payload.data?.url;
    const baseNotification: { title: string; body: string; tag: string; url?: string } = {
      title: payload.title,
      body: payload.body,
      tag: `${payload.notificationType}-${Date.now()}`,
    };
    
    if (typeof url === 'string') {
      baseNotification.url = url;
    }

    return baseNotification;
  }

  /**
   * Send push notification with retry logic
   */
  private async sendPushWithRetry(
    subscription: { endpoint: string; p256dh: string; auth: string },
    notification: { title: string; body: string; tag: string; url?: string },
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string; retryable?: boolean }> {
    try {
      const pushSubscription: { endpoint: string; keys: { p256dh: string; auth: string } } = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      const result = await sendToSubscription(pushSubscription, notification);
      
      if (result.success) {
        return { success: true };
      }

      // Check if error is retryable
      const errorLower = (result.error || '').toLowerCase();
      const isRetryable = !(
        errorLower.includes('410') ||
        errorLower.includes('gone') ||
        errorLower.includes('404') ||
        errorLower.includes('not found') ||
        errorLower.includes('not initialized')
      );

      if (!isRetryable) {
        return { 
          success: false, 
          error: result.error,
          retryable: false,
        };
      }

      // Retry if we haven't exceeded max attempts
      if (attempt < MAX_PUSH_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || 15000;
        console.log(`[PushWorker] Retry ${attempt}/${MAX_PUSH_RETRIES} after ${delay}ms`);
        await this.sleep(delay);
        return this.sendPushWithRetry(subscription, notification, attempt + 1);
      }

      return { 
        success: false, 
        error: `Failed after ${MAX_PUSH_RETRIES} attempts: ${result.error}`,
        retryable: false,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      
      // Retry if we haven't exceeded max attempts
      if (attempt < MAX_PUSH_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || 15000;
        console.log(`[PushWorker] Retry ${attempt}/${MAX_PUSH_RETRIES} after ${delay}ms`);
        await this.sleep(delay);
        return this.sendPushWithRetry(subscription, notification, attempt + 1);
      }

      return { 
        success: false, 
        error: `Failed after ${MAX_PUSH_RETRIES} attempts: ${error}`,
        retryable: false,
      };
    }
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record push run for observability
   */
  private recordRun(
    eventId: string,
    jobType: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    durationMs: number
  ): void {
    const runId = crypto.randomUUID();
    const status = output.success ? 'success' : 'error';
    
    db.prepare(`
      INSERT INTO event_runs (id, event_id, job_type, status, input_snapshot, output_snapshot, duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      runId,
      eventId,
      jobType,
      status,
      JSON.stringify(input),
      JSON.stringify(output),
      durationMs
    );
  }
}

export const pushWorker = new PushWorker();
