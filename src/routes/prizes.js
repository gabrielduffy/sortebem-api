import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

export default async function prizesRoutes(fastify) {
  // GET /prizes/check/:cardCode (público)
  fastify.get('/check/:cardCode', async (request, reply) => {
    try {
      const { cardCode } = request.params;

      const result = await db.query(
        `SELECT w.*,
                c.code as card_code,
                r.number as round_number
         FROM winners w
         LEFT JOIN cards c ON w.card_id = c.id
         LEFT JOIN rounds r ON w.round_id = r.id
         WHERE c.code = $1`,
        [cardCode]
      );

      if (result.rows.length === 0) {
        return reply.send(successResponse({ has_prize: false }));
      }

      return reply.send(successResponse({ has_prize: true, prize: result.rows[0] }));
    } catch (error) {
      console.error('Error checking prize:', error);
      return reply.status(500).send(errorResponse('Erro ao verificar prêmio'));
    }
  });

  // POST /prizes/claim (público - resgatar prêmio)
  fastify.post('/claim', async (request, reply) => {
    try {
      const { card_code, pix_key } = request.body;

      if (!card_code || !pix_key) {
        return reply.status(400).send(errorResponse('Código da cartela e chave PIX são obrigatórios'));
      }

      const result = await db.query(
        `UPDATE winners w
         SET status = 'claimed', pix_key = $1, claimed_at = NOW()
         FROM cards c
         WHERE w.card_id = c.id AND c.code = $2 AND w.status = 'pending'
         RETURNING w.*`,
        [pix_key, card_code]
      );

      if (result.rows.length === 0) {
        return reply.status(400).send(errorResponse('Prêmio não encontrado ou já resgatado'));
      }

      return reply.send(successResponse({ message: 'Prêmio reivindicado com sucesso! Aguarde o processamento.' }));
    } catch (error) {
      console.error('Error claiming prize:', error);
      return reply.status(500).send(errorResponse('Erro ao reivindicar prêmio'));
    }
  });

  // GET /prizes/history (admin only)
  fastify.get('/history', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT w.*,
                c.code as card_code,
                r.number as round_number
         FROM winners w
         LEFT JOIN cards c ON w.card_id = c.id
         LEFT JOIN rounds r ON w.round_id = r.id
         ORDER BY w.created_at DESC
         LIMIT 100`
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching prize history:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar histórico'));
    }
  });
}
