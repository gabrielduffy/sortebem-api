import { db } from '../config/database.js';
import { authRequired, authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

export default async function withdrawalsRoutes(fastify) {
  // POST /withdrawals (usuário logado)
  fastify.post('/withdrawals', { preHandler: authRequired }, async (request, reply) => {
    try {
      const { amount, pix_key } = request.body;

      const result = await db.query(
        `INSERT INTO withdrawals (user_id, amount, pix_key)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [request.user.id, amount, pix_key]
      );

      return reply.status(201).send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      return reply.status(500).send(errorResponse('Erro ao solicitar saque'));
    }
  });

  // GET /withdrawals (admin only)
  fastify.get('/withdrawals', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT w.*, u.name as user_name, u.email
         FROM withdrawals w
         JOIN users u ON w.user_id = u.id
         ORDER BY w.created_at DESC
         LIMIT 100`
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar saques'));
    }
  });

  // PUT /withdrawals/:id/process (admin only)
  fastify.put('/withdrawals/:id/process', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { status } = request.body;

      const result = await db.query(
        `UPDATE withdrawals
         SET status = $1, processed_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Saque não encontrado'));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      return reply.status(500).send(errorResponse('Erro ao processar saque'));
    }
  });
}
