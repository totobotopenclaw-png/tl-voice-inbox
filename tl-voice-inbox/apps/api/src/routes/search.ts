import type { FastifyInstance } from 'fastify';
import { searchRepository } from '../db/repositories/search.js';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/search?q=query&limit=20
  fastify.get('/search', async (request, reply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };

    if (!q || q.trim().length === 0) {
      reply.status(400);
      return { error: 'Missing required query parameter: q' };
    }

    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    try {
      const results = searchRepository.search(q, limitNum);
      return {
        query: q,
        count: results.length,
        results,
      };
    } catch (err) {
      fastify.log.error(err);
      reply.status(500);
      return { error: 'Search failed' };
    }
  });

  // POST /api/search/index - manual reindex endpoint (for admin use)
  fastify.post('/search/index', async (request, reply) => {
    try {
      searchRepository.rebuildIndex();
      return { status: 'index rebuilt' };
    } catch (err) {
      fastify.log.error(err);
      reply.status(500);
      return { error: 'Failed to rebuild index' };
    }
  });
}
