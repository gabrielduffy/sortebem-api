import { db } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { authAdmin, authEstablishment, authPOS } from '../middleware/auth.js';
import { generatePOSTerminalId, generatePOSApiKey } from '../utils/codeGenerator.js';
import { successResponse, errorResponse } from '../utils/helpers.js';
import { generateCards } from '../services/cardGenerator.js';

export default async function posRoutes(fastify) {
  // POST /pos/terminals (admin/establishment - criar terminal)
  fastify.post('/terminals', { preHandler: authEstablishment }, async (request, reply) => {
    try {
      const { establishment_id, name } = request.body;

      // Gerar terminal_id e api_key únicos
      let terminal_id = generatePOSTerminalId();
      const api_key = generatePOSApiKey();
      const api_key_hash = await bcrypt.hash(api_key, 10);

      const result = await db.query(
        `INSERT INTO pos_terminals (establishment_id, terminal_id, api_key_hash, name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, terminal_id, name, establishment_id`,
        [establishment_id, terminal_id, api_key_hash, name]
      );

      return reply.status(201).send(successResponse({
        ...result.rows[0],
        api_key // Retornar apenas na criação
      }));
    } catch (error) {
      console.error('Error creating POS terminal:', error);
      return reply.status(500).send(errorResponse('Erro ao criar terminal'));
    }
  });

  // POST /pos/auth (autenticar terminal)
  fastify.post('/auth', async (request, reply) => {
    try {
      const { terminal_id, api_key } = request.body;

      const result = await db.query(
        `SELECT pt.*, e.name as establishment_name
         FROM pos_terminals pt
         JOIN establishments e ON pt.establishment_id = e.id
         WHERE pt.terminal_id = $1 AND pt.is_active = true`,
        [terminal_id]
      );

      if (result.rows.length === 0) {
        return reply.status(401).send(errorResponse('Terminal não encontrado'));
      }

      const terminal = result.rows[0];
      const validKey = await bcrypt.compare(api_key, terminal.api_key_hash);

      if (!validKey) {
        return reply.status(401).send(errorResponse('API key inválida'));
      }

      // Atualizar heartbeat
      await db.query('UPDATE pos_terminals SET last_heartbeat = NOW() WHERE id = $1', [terminal.id]);

      return reply.send(successResponse({
        terminal_id: terminal.terminal_id,
        name: terminal.name,
        establishment_id: terminal.establishment_id,
        establishment_name: terminal.establishment_name
      }));
    } catch (error) {
      console.error('Error authenticating POS:', error);
      return reply.status(500).send(errorResponse('Erro ao autenticar'));
    }
  });

  // GET /pos/round/current (autenticado - rodada atual)
  fastify.get('/round/current', { preHandler: authPOS }, async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT * FROM rounds WHERE status = 'selling' ORDER BY starts_at ASC LIMIT 1`
      );

      return reply.send(successResponse(result.rows[0] || null));
    } catch (error) {
      console.error('Error fetching current round:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar rodada'));
    }
  });

  // POST /pos/sale (criar venda POS)
  fastify.post('/sale', { preHandler: authPOS }, async (request, reply) => {
    const client = await db.connect();
    try {
      const { round_id, quantity, payment_method } = request.body;

      await client.query('BEGIN');

      const roundResult = await client.query(
        'SELECT * FROM rounds WHERE id = $1 AND status = $2',
        [round_id, 'selling']
      );

      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Rodada não disponível'));
      }

      const round = roundResult.rows[0];
      const total_amount = round.card_price * quantity;

      // Criar compra
      const purchaseResult = await client.query(
        `INSERT INTO purchases (round_id, establishment_id, terminal_id, quantity, unit_price, total_amount, payment_method, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [round_id, request.terminal.establishment_id, request.terminal.id, quantity, round.card_price, total_amount, payment_method, payment_method === 'pix' ? 'pending' : 'paid']
      );

      const purchase = purchaseResult.rows[0];

      // Se pagamento em cartão, gerar cartelas imediatamente
      if (payment_method !== 'pix') {
        const cards = await generateCards(round_id, purchase.id, quantity);

        // Atualizar contadores
        await client.query(
          `UPDATE rounds SET cards_sold = cards_sold + $1, prize_pool = prize_pool + $2, charity_amount = charity_amount + $3, platform_amount = platform_amount + $4, commission_amount = commission_amount + $5 WHERE id = $6`,
          [quantity, total_amount * 0.4, total_amount * 0.2, total_amount * 0.3, total_amount * 0.1, round_id]
        );

        await client.query('COMMIT');

        return reply.status(201).send(successResponse({ purchase, cards }));
      }

      await client.query('COMMIT');

      return reply.status(201).send(successResponse({ purchase }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating POS sale:', error);
      return reply.status(500).send(errorResponse('Erro ao criar venda'));
    } finally {
      client.release();
    }
  });
}
