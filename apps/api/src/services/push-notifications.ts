// Push Notification Service - Helper to enqueue push notifications

import { enqueue } from '../queue/manager.js';
import { pushSubscriptionsRepository } from '../db/repositories/index.js';
import type { PushJobPayload } from '../queue/types.js';

/**
 * Enqueue a push notification for all active subscriptions
 */
export function enqueuePushNotification(
  eventId: string,
  notificationType: 'deadline_due' | 'deadline_soon' | 'needs_review',
  title: string,
  body: string,
  data?: Record<string, unknown>
): Array<{ subscriptionId: string; jobId: string }> {
  const subscriptions = pushSubscriptionsRepository.findAll();
  const results: Array<{ subscriptionId: string; jobId: string }> = [];

  for (const subscription of subscriptions) {
    const payload: PushJobPayload = {
      subscriptionId: subscription.id,
      notificationType,
      title,
      body,
      data,
    };

    const job = enqueue(eventId, 'push', payload as Record<string, unknown>);
    results.push({ subscriptionId: subscription.id, jobId: job.id });
  }

  console.log(`[PushService] Enqueued ${results.length} push notifications for event ${eventId}`);
  return results;
}

/**
 * Enqueue a needs_review notification
 */
export function enqueueNeedsReviewNotification(eventId: string, epicTitles: string[]): Array<{ subscriptionId: string; jobId: string }> {
  const title = 'Evento necesita revisión';
  const body = epicTitles.length > 0
    ? `Evento ambiguo. Candidatos: ${epicTitles.slice(0, 3).join(', ')}`
    : 'Evento ambiguo - se requiere asignación manual';

  return enqueuePushNotification(eventId, 'needs_review', title, body, { eventId, epicTitles });
}

/**
 * Enqueue a deadline due notification
 */
export function enqueueDeadlineDueNotification(
  eventId: string, 
  actionTitle: string, 
  epicTitle?: string
): Array<{ subscriptionId: string; jobId: string }> {
  const title = '⏰ Deadline vencido';
  const body = epicTitle 
    ? `"${actionTitle}" en ${epicTitle}`
    : `"${actionTitle}"`;

  return enqueuePushNotification(eventId, 'deadline_due', title, body, { eventId, actionTitle, epicTitle });
}

/**
 * Enqueue a deadline soon notification
 */
export function enqueueDeadlineSoonNotification(
  eventId: string,
  actionTitle: string,
  hoursRemaining: number,
  epicTitle?: string
): Array<{ subscriptionId: string; jobId: string }> {
  const title = `⏳ Deadline en ${hoursRemaining}h`;
  const body = epicTitle
    ? `"${actionTitle}" en ${epicTitle}`
    : `"${actionTitle}"`;

  return enqueuePushNotification(eventId, 'deadline_soon', title, body, { 
    eventId, 
    actionTitle, 
    epicTitle,
    hoursRemaining,
  });
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}
