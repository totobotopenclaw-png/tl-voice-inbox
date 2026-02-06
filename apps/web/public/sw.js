/// <reference lib="es2020" />
/// <reference lib="webworker" />

// Service Worker for TL Voice Inbox
// Handles push notifications and background sync

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'tl-voice-inbox-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(self.skipWaiting());
});

// Activate event - claim clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(self.clients.claim());
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data: {
    notification?: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      tag?: string;
      requireInteraction?: boolean;
      actions?: Array<{ action: string; title: string }>;
      data?: { url?: string; timestamp?: number };
    };
  } = {};

  try {
    data = event.data?.json() || {};
  } catch (err) {
    console.error('[SW] Failed to parse push data:', err);
  }

  const notification = data.notification || {
    title: 'TL Voice Inbox',
    body: 'You have a new notification',
  };

  const options: NotificationOptions = {
    body: notification.body,
    icon: notification.icon || '/icon-192x192.png',
    badge: notification.badge || '/badge-72x72.png',
    tag: notification.tag || 'tl-voice-inbox',
    requireInteraction: notification.requireInteraction ?? true,
    actions: notification.actions || [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    data: notification.data || { url: '/' },
  };

  event.waitUntil(
    self.registration.showNotification(notification.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/';

  // Handle action clicks
  if (event.action === 'dismiss') {
    return; // Just close the notification
  }

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window client is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      return self.clients.openWindow(url);
    })
  );
});

// Background sync (for offline support)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // Future: handle background sync for offline audio uploads
});

// Message from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message from main thread:', event.data);
  // Handle messages from the main app if needed
});

export {};
