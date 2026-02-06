// Push notification routes - subscribe/unsubscribe
import type { FastifyInstance } from 'fastify';
import { 
  subscribe, 
  unsubscribe, 
  getVapidPublicKey,
  isPushServiceReady 
} from '../services/push.js';

interface SubscribeBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}

export async function pushRoutes(fastify: FastifyInstance): Promise<void> {
  
  // GET /api/push/vapid-key - Get VAPID public key
  fastify.get('/vapid-key', async () => {
    const publicKey = getVapidPublicKey();
    
    if (!publicKey) {
      return {
        enabled: false,
        error: 'Push notifications not configured. VAPID keys missing.',
      };
    }

    return {
      enabled: isPushServiceReady(),
      publicKey,
    };
  });

  // POST /api/push/subscribe - Subscribe to push notifications
  fastify.post<{ Body: SubscribeBody }>('/subscribe', async (request, reply) => {
    const { endpoint, keys, userAgent } = request.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      reply.status(400);
      return { error: 'Missing required fields: endpoint, keys.p256dh, keys.auth' };
    }

    const result = subscribe(endpoint, keys.p256dh, keys.auth, userAgent);

    if (!result.success) {
      reply.status(500);
      return { error: result.error };
    }

    reply.status(201);
    return { 
      success: true, 
      subscriptionId: result.id,
      message: 'Subscribed successfully'
    };
  });

  // DELETE /api/push/unsubscribe - Unsubscribe from push notifications
  fastify.delete<{ Body: { endpoint: string } }>('/unsubscribe', async (request, reply) => {
    const { endpoint } = request.body;

    if (!endpoint) {
      reply.status(400);
      return { error: 'Missing required field: endpoint' };
    }

    const result = unsubscribe(endpoint);

    if (!result.success) {
      reply.status(500);
      return { error: result.error };
    }

    return { 
      success: true,
      message: 'Unsubscribed successfully'
    };
  });
}
