import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { pushRoutes } from '../../src/routes/push';
import { createTestDb, clearTables, closeTestDb, getTestDb } from '../utils/database';
import type { Database as DatabaseType } from 'better-sqlite3';

// Mock the push service
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockGetVapidPublicKey = vi.fn();
const mockIsPushServiceReady = vi.fn();

vi.mock('../../src/services/push', () => ({
  subscribe: (...args: unknown[]) => mockSubscribe(...args),
  unsubscribe: (...args: unknown[]) => mockUnsubscribe(...args),
  getVapidPublicKey: () => mockGetVapidPublicKey(),
  isPushServiceReady: () => mockIsPushServiceReady(),
}));

// Mock the db module
vi.mock('../../src/db/connection', () => ({
  db: null,
}));

describe('Push API', () => {
  let app: FastifyInstance;
  let db: DatabaseType;

  beforeAll(async () => {
    db = createTestDb();
    const dbModule = await import('../../src/db/connection');
    (dbModule as { db: DatabaseType }).db = db;

    app = Fastify();
    await app.register(pushRoutes, { prefix: '/api/push' });
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    clearTables(db);
  });

  afterAll(async () => {
    await app.close();
    closeTestDb();
  });

  describe('GET /api/push/vapid-key', () => {
    it('should return public key when configured', async () => {
      mockGetVapidPublicKey.mockReturnValue('test-public-key-12345');
      mockIsPushServiceReady.mockReturnValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/api/push/vapid-key',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.enabled).toBe(true);
      expect(body.publicKey).toBe('test-public-key-12345');
    });

    it('should return error when not configured', async () => {
      mockGetVapidPublicKey.mockReturnValue('');
      mockIsPushServiceReady.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/push/vapid-key',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.enabled).toBe(false);
      expect(body.error).toContain('not configured');
    });

    it('should return null/undefined public key when not set', async () => {
      mockGetVapidPublicKey.mockReturnValue(null);
      mockIsPushServiceReady.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/push/vapid-key',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      // publicKey may be null, undefined, or empty string depending on implementation
      expect(body.publicKey === null || body.publicKey === undefined || body.publicKey === '').toBe(true);
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('should subscribe with valid payload', async () => {
      mockSubscribe.mockReturnValue({ success: true, id: 'sub-123' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
          userAgent: 'Mozilla/5.0 Test',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.subscriptionId).toBe('sub-123');
      expect(mockSubscribe).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send/test-token',
        'test-p256dh-key',
        'test-auth-key',
        'Mozilla/5.0 Test'
      );
    });

    it('should subscribe without userAgent', async () => {
      mockSubscribe.mockReturnValue({ success: true, id: 'sub-456' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockSubscribe).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send/test-token',
        'test-p256dh-key',
        'test-auth-key',
        undefined
      );
    });

    it('should return 400 when endpoint is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('endpoint');
    });

    it('should return 400 when p256dh is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
          keys: {
            auth: 'test-auth-key',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('p256dh');
    });

    it('should return 400 when auth is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
          keys: {
            p256dh: 'test-p256dh-key',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('auth');
    });

    it('should return 400 when keys object is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('keys');
    });

    it('should return 500 when subscription fails', async () => {
      mockSubscribe.mockReturnValue({ success: false, error: 'Database error' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
          keys: {
            p256dh: 'test-p256dh-key',
            auth: 'test-auth-key',
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Database error');
    });
  });

  describe('DELETE /api/push/unsubscribe', () => {
    it('should unsubscribe with valid endpoint', async () => {
      mockUnsubscribe.mockReturnValue({ success: true });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/push/unsubscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/test-token');
    });

    it('should return 400 when endpoint is missing', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/push/unsubscribe',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('endpoint');
    });

    it('should return 500 when unsubscribe fails', async () => {
      mockUnsubscribe.mockReturnValue({ success: false, error: 'Subscription not found' });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/push/unsubscribe',
        payload: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Subscription not found');
    });
  });
});
