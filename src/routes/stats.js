import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

export default async function statsRoutes(fastify) {
  // GET /stats/admin (admin only)
  fastify.get('/stats/admin', { preHandler: authAdmin }, async (request, reply) => {
    try {
      // Total de vendas
      const salesResult = await db.query(
        `SELECT COUNT(*) as total_purchases, SUM(total_amount) as total_revenue
         FROM purchases WHERE payment_status = 'paid'`
      );

      // Total de cartelas vendidas
      const cardsResult = await db.query(
        'SELECT COUNT(*) as total_cards FROM cards'
      );

      // Rodadas
      const roundsResult = await db.query(
        `SELECT status, COUNT(*) as count FROM rounds GROUP BY status`
      );

      // Usuários
      const usersResult = await db.query(
        `SELECT role, COUNT(*) as count FROM users WHERE is_active = true GROUP BY role`
      );

      return reply.send(successResponse({
        sales: salesResult.rows[0],
        cards: cardsResult.rows[0],
        rounds: roundsResult.rows,
        users: usersResult.rows
      }));
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estatísticas'));
    }
  });
}
