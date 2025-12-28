import { db } from '../config/database.js';
import { getCardByCode, convertToGrid } from '../services/cardGenerator.js';
import { checkWin } from '../services/winChecker.js';
import { getSetting, successResponse, errorResponse } from '../utils/helpers.js';

export default async function cardsRoutes(fastify) {
  // GET /cards/:code (público - ver cartela pelo código)
  fastify.get('/:code', async (request, reply) => {
    try {
      const { code } = request.params;

      const card = await getCardByCode(code);

      if (!card) {
        return reply.status(404).send(errorResponse('Cartela não encontrada'));
      }

      return reply.send(successResponse(card));
    } catch (error) {
      console.error('Error fetching card:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar cartela'));
    }
  });

  // GET /cards/:code/check (público - verificar se cartela ganhou)
  fastify.get('/:code/check', async (request, reply) => {
    try {
      const { code } = request.params;

      const card = await getCardByCode(code);

      if (!card) {
        return reply.status(404).send(errorResponse('Cartela não encontrada'));
      }

      // Buscar rodada
      const roundResult = await db.query(
        'SELECT * FROM rounds WHERE id = $1',
        [card.round_id]
      );

      if (roundResult.rows.length === 0) {
        return reply.status(404).send(errorResponse('Rodada não encontrada'));
      }

      const round = roundResult.rows[0];

      // Verificar se rodada já tem números sorteados
      if (!round.drawn_numbers || round.drawn_numbers.length === 0) {
        return reply.send(successResponse({
          card_code: code,
          round_status: round.status,
          won: false,
          message: 'Sorteio ainda não iniciado'
        }));
      }

      // Buscar padrões ativos
      const patterns = await getSetting('winning_patterns') || ['line_horizontal', 'line_vertical', 'diagonal', 'full_card'];

      // Verificar vitória
      const winResult = checkWin(card.numbers, round.drawn_numbers, patterns);

      return reply.send(successResponse({
        card_code: code,
        round_id: round.id,
        round_number: round.number,
        round_status: round.status,
        drawn_count: round.drawn_numbers.length,
        ...winResult
      }));
    } catch (error) {
      console.error('Error checking card:', error);
      return reply.status(500).send(errorResponse('Erro ao verificar cartela'));
    }
  });

  // POST /cards/:code/declare-victory (público - declarar vitória)
  fastify.post('/:code/declare-victory', async (request, reply) => {
    const client = await db.connect();

    try {
      const { code } = request.params;

      await client.query('BEGIN');

      const card = await getCardByCode(code);

      if (!card) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorResponse('Cartela não encontrada'));
      }

      // Verificar se compra foi paga
      if (card.payment_status !== 'paid') {
        await client.query('ROLLBACK');
        return reply.status(403).send(errorResponse('Compra não foi paga'));
      }

      // Buscar rodada
      const roundResult = await client.query(
        'SELECT * FROM rounds WHERE id = $1',
        [card.round_id]
      );

      const round = roundResult.rows[0];

      // Verificar se rodada está em sorteio
      if (round.status !== 'drawing') {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Rodada não está em sorteio'));
      }

      // Buscar padrões ativos
      const patterns = await getSetting('winning_patterns') || ['line_horizontal', 'line_vertical', 'diagonal', 'full_card'];

      // Verificar vitória
      const winResult = checkWin(card.numbers, round.drawn_numbers, patterns);

      if (!winResult.won) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Cartela não completou nenhum padrão vencedor'));
      }

      // Verificar se já declarou
      if (card.is_winner) {
        await client.query('ROLLBACK');
        return reply.send(successResponse({
          message: 'Vitória já declarada anteriormente',
          already_declared: true
        }));
      }

      // Marcar cartela como vencedora
      await client.query(
        `UPDATE cards SET is_winner = true, declared_at = NOW() WHERE id = $1`,
        [card.id]
      );

      // Registrar vitória
      const prizeAmount = round.prize_pool; // Será dividido se houver empate

      await client.query(
        `INSERT INTO winners (round_id, card_id, prize_amount, pattern_matched)
         VALUES ($1, $2, $3, $4)`,
        [round.id, card.id, prizeAmount, winResult.pattern]
      );

      await client.query('COMMIT');

      return reply.send(successResponse({
        message: 'Vitória declarada com sucesso!',
        pattern: winResult.pattern,
        prize_amount: prizeAmount
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error declaring victory:', error);
      return reply.status(500).send(errorResponse('Erro ao declarar vitória'));
    } finally {
      client.release();
    }
  });
}
