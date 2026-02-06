// Push notification service using web-push
import webPush from 'web-push';
import { pushSubscriptionsRepository } from '../db/repositories/index.js';

// VAPID keys from environment or generate new ones
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@tl-voice-inbox.local';

let isInitialized = false;

/**
 * Initialize web-push with VAPID keys
 */
export function initializePushService(): void {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[PushService] VAPID keys not configured. Push notifications will be disabled.');
    console.warn('[PushService] Run: pnpm generate-vapid-keys');
    return;
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  isInitialized = true;
  console.log('[PushService] Push service initialized');
}

/**
 * Check if push service is ready
 */
export function isPushServiceReady(): boolean {
  return isInitialized;
}

/**
 * Subscribe a client to push notifications
 */
export function subscribe(
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string
): { success: true; id: string } | { success: false; error: string } {
  try {
    // Check if already subscribed
    const existing = pushSubscriptionsRepository.findByEndpoint(endpoint);
    if (existing) {
      return { success: true, id: existing.id };
    }

    const subscription = pushSubscriptionsRepository.create({
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent || null,
    });

    console.log(`[PushService] New subscription: ${subscription.id}`);
    return { success: true, id: subscription.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[PushService] Subscribe error:', error);
    return { success: false, error };
  }
}

/**
 * Unsubscribe a client from push notifications
 */
export function unsubscribe(endpoint: string): { success: true } | { success: false; error: string } {
  try {
    pushSubscriptionsRepository.deleteByEndpoint(endpoint);
    console.log(`[PushService] Unsubscribed: ${endpoint.substring(0, 50)}...`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[PushService] Unsubscribe error:', error);
    return { success: false, error };
  }
}

/**
 * Send a push notification to a specific subscription
 */
export async function sendToSubscription(
  subscription: webPush.PushSubscription,
  payload: { title: string; body: string; icon?: string; tag?: string; url?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!isInitialized) {
    return { success: false, error: 'Push service not initialized' };
  }

  try {
    const notificationPayload = JSON.stringify({
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: payload.tag || 'tl-voice-inbox',
        requireInteraction: true,
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        data: {
          url: payload.url || '/',
          timestamp: Date.now(),
        },
      },
    });

    await webPush.sendNotification(subscription, notificationPayload);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    
    // Check if subscription is expired/invalid
    if (err instanceof webPush.WebPushError && err.statusCode === 410) {
      console.log('[PushService] Subscription expired, removing:', subscription.endpoint.substring(0, 50) + '...');
      pushSubscriptionsRepository.deleteByEndpoint(subscription.endpoint);
    }
    
    return { success: false, error };
  }
}

/**
 * Send a notification to all subscribers
 */
export async function broadcast(
  payload: { title: string; body: string; icon?: string; tag?: string; url?: string }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!isInitialized) {
    return { sent: 0, failed: 0, errors: ['Push service not initialized'] };
  }

  const subscriptions = pushSubscriptionsRepository.findAll();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const sub of subscriptions) {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    const result = await sendToSubscription(pushSubscription, payload);
    if (result.success) {
      sent++;
    } else {
      failed++;
      if (!errors.includes(result.error!)) {
        errors.push(result.error!);
      }
    }
  }

  console.log(`[PushService] Broadcast: ${sent} sent, ${failed} failed`);
  return { sent, failed, errors };
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(): string {
  return vapidPublicKey;
}
