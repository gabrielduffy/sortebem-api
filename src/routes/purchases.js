import { db } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { generateCards } from '../services/cardGenerator.js';
import { generatePix } from '../services/pixService.js';
import { sendCardsViaWhatsApp } from '../services/whatsappService.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';

export default async function purchasesRoutes(fastify) {
  // POST /purchases (público - criar compra)
  fastify.post('/purchases', {
    preHandler: validate({
      required: ['round_id', 'quantity', 'payment_method'],
      fields: {
        round_id: { type: 'number', min: 1 },
        quantity: { type: 'number', min: 1, max: 100 },
        payment_method: { type: 'string', enum: ['pix', 'credit_card', 'debit_card'] },
        customer_whatsapp: { type: 'string' }
      }
    })
  }, async (request, reply) => {
    const client = await db.connect();

    try {
      const { round_id, quantity, payment_method, customer_whatsapp } = request.body;

      await client.query('BEGIN');

      // Verificar rodada
      const roundResult = await client.query(
        'SELECT * FROM rounds WHERE id = $1 AND status = $2',
        [round_id, 'selling']
      );

      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Rodada não disponível para venda'));
      }

      const round = roundResult.rows[0];

      // Verificar limite de cartelas
      if (round.cards_sold + quantity > round.max_cards) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Quantidade excede limite disponível'));
      }

      const unit_price = round.card_price;
      const total_amount = unit_price * quantity;

      // Criar compra
      const purchaseResult = await client.query(
        `INSERT INTO purchases (round_id, quantity, unit_price, total_amount, payment_method, customer_whatsapp, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [round_id, quantity, unit_price, total_amount, payment_method, customer_whatsapp || null]
      );

      const purchase = purchaseResult.rows[0];

      // Gerar dados de pagamento (apenas PIX por enquanto)
      let paymentData = null;

      if (payment_method === 'pix') {
        paymentData = await generatePix(total_amount, purchase.id);

        // Atualizar compra com dados do PIX
        await client.query(
          `UPDATE purchases
           SET pix_code = $1, pix_qrcode = $2, pix_expiration = $3, pix_transaction_id = $4
           WHERE id = $5`,
          [paymentData.code, paymentData.qrcode, paymentData.expiration, paymentData.transaction_id, purchase.id]
        );
      }

      await client.query('COMMIT');

      return reply.status(201).send(successResponse({
        purchase_id: purchase.id,
        total_amount,
        payment_method,
        payment_data: paymentData,
        message: 'Compra criada. Aguardando pagamento.'
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating purchase:', error);
      return reply.status(500).send(errorResponse('Erro ao criar compra'));
    } finally {
      client.release();
    }
  });

  // GET /purchases/:id (público - status da compra)
  fastify.get('/purchases/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        `SELECT p.*, r.number as round_number, r.type as round_type
         FROM purchases p
         JOIN rounds r ON p.round_id = r.id
         WHERE p.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Compra não encontrada'));
      }

      const purchase = result.rows[0];

      // Não retornar informações sensíveis se não estiver pago
      if (purchase.payment_status !== 'paid') {
        delete purchase.pix_code;
      }

      return reply.send(successResponse(purchase));
    } catch (error) {
      console.error('Error fetching purchase:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar compra'));
    }
  });

  // GET /purchases/:id/cards (público - listar cartelas após pagamento)
  fastify.get('/purchases/:id/cards', async (request, reply) => {
    try {
      const { id } = request.params;

      // Verificar se compra existe e está paga
      const purchaseResult = await db.query(
        'SELECT payment_status FROM purchases WHERE id = $1',
        [id]
      );

      if (purchaseResult.rows.length === 0) {
        return reply.status(404).send(errorResponse('Compra não encontrada'));
      }

      if (purchaseResult.rows[0].payment_status !== 'paid') {
        return reply.status(403).send(errorResponse('Compra ainda não foi paga'));
      }

      // Buscar cartelas
      const cardsResult = await db.query(
        'SELECT id, code, numbers FROM cards WHERE purchase_id = $1',
        [id]
      );

      return reply.send(successResponse(cardsResult.rows));
    } catch (error) {
      console.error('Error fetching purchase cards:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar cartelas'));
    }
  });

  // POST /purchases/:id/cancel (público - cancelar compra pendente)
  fastify.post('/purchases/:id/cancel', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        `UPDATE purchases
         SET payment_status = 'cancelled'
         WHERE id = $1 AND payment_status = 'pending'
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(400).send(errorResponse('Compra não pode ser cancelada'));
      }

      return reply.send(successResponse({ message: 'Compra cancelada' }));
    } catch (error) {
      console.error('Error cancelling purchase:', error);
      return reply.status(500).send(errorResponse('Erro ao cancelar compra'));
    }
  });
}
