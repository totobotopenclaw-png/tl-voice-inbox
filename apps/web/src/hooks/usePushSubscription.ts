import { useState, useEffect, useCallback } from 'react';

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';

interface PushSubscriptionState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  publicKey: string | null;
}

interface PushSubscriptionHook {
  state: PushSubscriptionState;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushSubscription(): PushSubscriptionHook {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    error: null,
    publicKey: null,
  });

  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Check support and get VAPID key on mount
  useEffect(() => {
    const init = async () => {
      // Check if push is supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js');
        setRegistration(reg);

        // Get existing subscription
        const existingSub = await reg.pushManager.getSubscription();
        setSubscription(existingSub);

        // Get VAPID public key from server
        const response = await fetch(`${API_URL}/api/push/vapid-key`);
        const data = await response.json();

        setState(prev => ({
          ...prev,
          isSupported: data.enabled && data.publicKey,
          isSubscribed: !!existingSub,
          isLoading: false,
          publicKey: data.publicKey,
          error: data.enabled ? null : 'Push notifications not configured on server',
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          isSupported: true,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to initialize push notifications',
        }));
      }
    };

    init();
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!registration || !state.publicKey) {
      setState(prev => ({ ...prev, error: 'Push not initialized' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Convert VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(state.publicKey);

      // Subscribe
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });

      setSubscription(sub);

      // Send subscription to server
      const response = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
            auth: arrayBufferToBase64(sub.getKey('auth')!),
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription on server');
      }

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Subscription failed',
      }));
    }
  }, [registration, state.publicKey]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!subscription) {
      setState(prev => ({ ...prev, error: 'Not subscribed' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Remove from server
      await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      setSubscription(null);
      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unsubscribe failed',
      }));
    }
  }, [subscription]);

  return { state, subscribe, unsubscribe };
}

// Helper: Convert URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper: Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
