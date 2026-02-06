import type { FastifyInstance } from 'fastify';
import { searchRepository } from '../db/repositories/search.js';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/search?q=query&limit=20&epic=xxx&type=action|knowledge&status=pending
  fastify.get('/search', async (request, reply) => {
    const { q, limit, epic, type, status } = request.query as { 
      q?: string; 
      limit?: string;
      epic?: string;
      type?: string;
      status?: string;
    };

    if (!q || q.trim().length === 0) {
      reply.status(400);
      return { error: 'Missing required query parameter: q' };
    }

    const limitNum = Math.min(parseInt(limit || '20', 10), 100);

    try {
      let results = searchRepository.search(q, limitNum);

      // Apply filters
      if (epic) {
        // Filter by epic (requires joining with source tables)
        results = searchRepository.searchByEpic(q, epic, limitNum);
      }

      if (type) {
        // Filter by content type (action, knowledge, epic)
        results = results.filter(r => r.type === type);
      }

      if (status) {
        // Filter by status (for actions only)
        results = results.filter(r => {
          if (r.type !== 'action') return true; // Keep non-actions
          // For actions, check status from metadata
          return r.status === status;
        });
      }

      return {
        query: q,
        filters: { epic, type, status },
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
