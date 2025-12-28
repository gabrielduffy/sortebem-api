import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import {
  createNextRound,
  startRoundDrawing,
  drawNextNumber,
  finishRound,
  cancelRound
} from '../services/roundManager.js';
import { successResponse, errorResponse, createPaginationMeta, calculateOffset } from '../utils/helpers.js';

export default async function roundsRoutes(fastify) {
  // GET / (público - listar rodadas ativas e próximas)
  fastify.get('/', async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT * FROM rounds
         WHERE status IN ('scheduled', 'selling', 'drawing')
         ORDER BY starts_at ASC
         LIMIT 20`
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching rounds:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar rodadas'));
    }
  });

  // GET /current (público - rodada atual vendendo)
  fastify.get('/current', async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT * FROM rounds
         WHERE status = 'selling'
         ORDER BY starts_at ASC
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        return reply.send(successResponse(null));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching current round:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar rodada atual'));
    }
  });

  // GET /live (público - rodada ao vivo sorteando)
  fastify.get('/live', async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT * FROM rounds
         WHERE status = 'drawing'
         ORDER BY drawing_started_at DESC
         LIMIT 1`
      );

      if (result.rows.length === 0) {
        return reply.send(successResponse(null));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching live round:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar rodada ao vivo'));
    }
  });

  // GET /:id (público)
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query('SELECT * FROM rounds WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Rodada não encontrada'));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching round:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar rodada'));
    }
  });

  // GET /:id/numbers (público - números já sorteados)
  fastify.get('/:id/numbers', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        `SELECT number, position, drawn_at FROM draws
         WHERE round_id = $1
         ORDER BY position ASC`,
        [id]
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching round numbers:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar números sorteados'));
    }
  });

  // GET /:id/cards (admin only)
  fastify.get('/:id/cards', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { page = 1, limit = 50 } = request.query;

      const offset = calculateOffset(page, limit);

      const countResult = await db.query(
        'SELECT COUNT(*) FROM cards WHERE round_id = $1',
        [id]
      );

      const result = await db.query(
        `SELECT * FROM cards
         WHERE round_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limit, offset]
      );

      const total = parseInt(countResult.rows[0].count);

      return reply.send(successResponse({
        cards: result.rows,
        meta: createPaginationMeta(total, page, limit)
      }));
    } catch (error) {
      console.error('Error fetching round cards:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar cartelas'));
    }
  });

  // POST / (admin only - criar rodada manual)
  fastify.post('/', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { type = 'regular' } = request.body;

      const round = await createNextRound(type);

      return reply.status(201).send(successResponse(round));
    } catch (error) {
      console.error('Error creating round:', error);
      return reply.status(500).send(errorResponse('Erro ao criar rodada'));
    }
  });

  // POST /:id/start-drawing (admin only)
  fastify.post('/:id/start-drawing', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const success = await startRoundDrawing(id);

      if (!success) {
        return reply.status(400).send(errorResponse('Não foi possível iniciar sorteio'));
      }

      return reply.send(successResponse({ message: 'Sorteio iniciado' }));
    } catch (error) {
      console.error('Error starting drawing:', error);
      return reply.status(500).send(errorResponse('Erro ao iniciar sorteio'));
    }
  });

  // POST /:id/draw-number (admin only)
  fastify.post('/:id/draw-number', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await drawNextNumber(id);

      return reply.send(successResponse(result));
    } catch (error) {
      console.error('Error drawing number:', error);
      return reply.status(500).send(errorResponse(error.message || 'Erro ao sortear número'));
    }
  });

  // POST /:id/finish (admin only)
  fastify.post('/:id/finish', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const success = await finishRound(id);

      if (!success) {
        return reply.status(400).send(errorResponse('Não foi possível finalizar rodada'));
      }

      return reply.send(successResponse({ message: 'Rodada finalizada' }));
    } catch (error) {
      console.error('Error finishing round:', error);
      return reply.status(500).send(errorResponse('Erro ao finalizar rodada'));
    }
  });

  // POST /:id/cancel (admin only)
  fastify.post('/:id/cancel', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const success = await cancelRound(id);

      if (!success) {
        return reply.status(400).send(errorResponse('Não foi possível cancelar rodada'));
      }

      return reply.send(successResponse({ message: 'Rodada cancelada e compras reembolsadas' }));
    } catch (error) {
      console.error('Error cancelling round:', error);
      return reply.status(500).send(errorResponse('Erro ao cancelar rodada'));
    }
  });

  // GET /history (público - histórico)
  fastify.get('/history', async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      const offset = calculateOffset(page, limit);

      const countResult = await db.query(
        `SELECT COUNT(*) FROM rounds WHERE status = 'finished'`
      );

      const result = await db.query(
        `SELECT * FROM rounds
         WHERE status = 'finished'
         ORDER BY finished_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const total = parseInt(countResult.rows[0].count);

      return reply.send(successResponse({
        rounds: result.rows,
        meta: createPaginationMeta(total, page, limit)
      }));
    } catch (error) {
      console.error('Error fetching history:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar histórico'));
    }
  });
}
