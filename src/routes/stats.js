import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

export default async function statsRoutes(fastify) {
  // GET /stats/admin (admin only)
  fastify.get('/admin', { preHandler: authAdmin }, async (request, reply) => {
    try {
      // Total de vendas
      const salesResult = await db.query(
        `SELECT COUNT(*) as total_purchases, SUM(total_amount) as total_revenue
         FROM purchases WHERE payment_status = 'paid'`
      );

      // Total de cartelas vendidas
      const cardsResult = await db.query(
        'SELECT COUNT(*) as total_cards FROM cards WHERE status = $1',
        ['sold']
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

  // GET /stats/tv (público - dados para modo TV)
  fastify.get('/tv', async (request, reply) => {
    try {
      // Rodada atual (em sorteio ou próxima)
      const currentRoundResult = await db.query(
        `SELECT * FROM rounds
         WHERE status IN ('drawing', 'selling')
         ORDER BY
           CASE status
             WHEN 'drawing' THEN 1
             WHEN 'selling' THEN 2
           END,
           starts_at ASC
         LIMIT 1`
      );

      let currentRound = null;
      let drawnNumbers = [];
      let recentWinners = [];

      if (currentRoundResult.rows.length > 0) {
        currentRound = currentRoundResult.rows[0];

        // Números sorteados
        if (currentRound.status === 'drawing' && currentRound.drawn_numbers) {
          drawnNumbers = currentRound.drawn_numbers;
        }
      }

      // Últimos ganhadores (últimas 5 rodadas finalizadas)
      const winnersResult = await db.query(
        `SELECT
          r.number as round_number,
          r.type as round_type,
          w.card_code,
          w.pattern,
          w.prize_amount,
          w.created_at
         FROM winners w
         JOIN rounds r ON w.round_id = r.id
         WHERE r.status = 'finished'
         ORDER BY w.created_at DESC
         LIMIT 10`
      );

      recentWinners = winnersResult.rows;

      // Total arrecadado para caridade
      const charityResult = await db.query(
        `SELECT COALESCE(SUM(charity_amount), 0) as total_charity
         FROM rounds WHERE status = 'finished'`
      );

      return reply.send(successResponse({
        current_round: currentRound,
        drawn_numbers: drawnNumbers,
        recent_winners: recentWinners,
        total_charity: parseFloat(charityResult.rows[0].total_charity || 0)
      }));
    } catch (error) {
      console.error('Error fetching TV stats:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar dados da TV'));
    }
  });

  // GET /stats/round/:id (público - estatísticas de uma rodada)
  fastify.get('/round/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const roundResult = await db.query(
        'SELECT * FROM rounds WHERE id = $1',
        [id]
      );

      if (roundResult.rows.length === 0) {
        return reply.status(404).send(errorResponse('Rodada não encontrada'));
      }

      const round = roundResult.rows[0];

      // Cartelas vendidas
      const cardsResult = await db.query(
        'SELECT COUNT(*) as sold_cards FROM cards WHERE round_id = $1 AND status = $2',
        [id, 'sold']
      );

      // Total vendido
      const salesResult = await db.query(
        'SELECT COALESCE(SUM(total_amount), 0) as total_sales FROM purchases WHERE round_id = $1 AND payment_status = $2',
        [id, 'paid']
      );

      // Ganhadores
      const winnersResult = await db.query(
        'SELECT card_code, pattern, prize_amount, created_at FROM winners WHERE round_id = $1 ORDER BY created_at',
        [id]
      );

      return reply.send(successResponse({
        round,
        sold_cards: parseInt(cardsResult.rows[0].sold_cards),
        total_sales: parseFloat(salesResult.rows[0].total_sales),
        winners: winnersResult.rows
      }));
    } catch (error) {
      console.error('Error fetching round stats:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estatísticas da rodada'));
    }
  });

  // GET /stats/dashboard (admin - dashboard completo)
  fastify.get('/dashboard', { preHandler: authAdmin }, async (request, reply) => {
    try {
      // Vendas hoje
      const todaySalesResult = await db.query(
        `SELECT
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as amount
         FROM purchases
         WHERE payment_status = 'paid'
         AND DATE(paid_at) = CURRENT_DATE`
      );

      // Vendas mês
      const monthSalesResult = await db.query(
        `SELECT
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as amount
         FROM purchases
         WHERE payment_status = 'paid'
         AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE)`
      );

      // Rodadas ativas
      const activeRoundsResult = await db.query(
        `SELECT COUNT(*) as count
         FROM rounds
         WHERE status IN ('scheduled', 'selling', 'drawing')`
      );

      // Usuários ativos
      const activeUsersResult = await db.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE is_active = true`
      );

      // Saldo de estabelecimentos
      const establishmentsBalanceResult = await db.query(
        `SELECT COALESCE(SUM(balance), 0) as total
         FROM establishments`
      );

      // Saldo de gerentes
      const managersBalanceResult = await db.query(
        `SELECT COALESCE(SUM(balance), 0) as total
         FROM managers`
      );

      // Total para caridade
      const charityTotalResult = await db.query(
        `SELECT COALESCE(SUM(total_received), 0) as total
         FROM charities`
      );

      return reply.send(successResponse({
        today_sales: todaySalesResult.rows[0],
        month_sales: monthSalesResult.rows[0],
        active_rounds: parseInt(activeRoundsResult.rows[0].count),
        active_users: parseInt(activeUsersResult.rows[0].count),
        establishments_balance: parseFloat(establishmentsBalanceResult.rows[0].total),
        managers_balance: parseFloat(managersBalanceResult.rows[0].total),
        charity_total: parseFloat(charityTotalResult.rows[0].total)
      }));
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estatísticas do dashboard'));
    }
  });
}
