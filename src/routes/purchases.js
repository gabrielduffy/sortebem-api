import { db } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { generateCards } from '../services/cardGenerator.js';
import { createPixPayment, createCreditCardPayment, checkPaymentStatus, refundPayment, handlePaymentWebhook } from '../services/paymentService.js';
import { sendCardsViaWhatsApp } from '../services/whatsappService.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';
import { authAdmin } from '../middleware/auth.js';

export default async function purchasesRoutes(fastify) {
  // POST /purchases (público - criar compra)
  fastify.post('/', async (request, reply) => {
    const client = await db.connect();

    try {
      const {
        round_id,
        quantity,
        payment_method,
        customer,
        card_token,
        installments,
        card_holder
      } = request.body;

      // Validações básicas
      if (!round_id || !quantity || !payment_method || !customer) {
        return reply.status(400).send(errorResponse('Dados incompletos'));
      }

      await client.query('BEGIN');

      // Verificar rodada
      const roundResult = await client.query(
        'SELECT * FROM rounds WHERE id = $1 AND status = $2 AND is_selling = true',
        [round_id, 'selling']
      );

      if (roundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse('Rodada não disponível para venda'));
      }

      const round = roundResult.rows[0];

      // Verificar limite de cartelas
      const availableCards = round.max_cards - round.cards_sold;
      if (quantity > availableCards) {
        await client.query('ROLLBACK');
        return reply.status(400).send(errorResponse(`Apenas ${availableCards} cartela(s) disponível(is)`));
      }

      const unit_price = round.card_price;
      const total_amount = unit_price * quantity;

      // Buscar ou criar usuário
      let userId = null;
      if (customer.email) {
        const userResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [customer.email]
        );

        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        } else {
          // Criar usuário
          const newUserResult = await client.query(
            `INSERT INTO users (name, email, phone, cpf, role, is_active)
             VALUES ($1, $2, $3, $4, 'user', true)
             RETURNING id`,
            [customer.name, customer.email, customer.phone, customer.cpf]
          );
          userId = newUserResult.rows[0].id;
        }
      }

      // Criar compra
      const purchaseResult = await client.query(
        `INSERT INTO purchases (
          round_id, user_id, quantity, unit_price, total_amount,
          payment_method, payment_status, customer_name, customer_email,
          customer_phone, customer_cpf, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, NOW())
        RETURNING *`,
        [
          round_id, userId, quantity, unit_price, total_amount,
          payment_method, customer.name, customer.email,
          customer.phone, customer.cpf
        ]
      );

      const purchase = purchaseResult.rows[0];

      // Gerar cartelas
      const cards = await generateCards(round_id, purchase.id, userId, quantity, client);

      // Atualizar contador de cartelas vendidas
      await client.query(
        'UPDATE rounds SET cards_sold = cards_sold + $1 WHERE id = $2',
        [quantity, round_id]
      );

      await client.query('COMMIT');

      // Processar pagamento
      let paymentData;

      try {
        if (payment_method === 'pix') {
          paymentData = await createPixPayment({
            purchase,
            customer
          });
        } else if (payment_method === 'credit_card') {
          if (!card_token || !card_holder) {
            return reply.status(400).send(errorResponse('Dados do cartão incompletos'));
          }

          paymentData = await createCreditCardPayment({
            purchase,
            customer,
            cardToken: card_token,
            installments: installments || 1,
            holder: card_holder
          });
        } else {
          return reply.status(400).send(errorResponse('Método de pagamento inválido'));
        }

        return reply.status(201).send(successResponse({
          purchase_id: purchase.id,
          round_id: round.id,
          round_number: round.number,
          quantity,
          total_amount,
          payment_method,
          payment_data: paymentData,
          cards: cards.map(c => ({ code: c.code }))
        }));

      } catch (paymentError) {
        console.error('Error processing payment:', paymentError);
        return reply.status(500).send(errorResponse('Erro ao processar pagamento: ' + paymentError.message));
      }

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating purchase:', error);
      return reply.status(500).send(errorResponse('Erro ao criar compra'));
    } finally {
      client.release();
    }
  });

  // GET /purchases/:id (público - status da compra)
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        `SELECT p.*, r.number as round_number, r.type as round_type
         FROM purchases p
         LEFT JOIN rounds r ON p.round_id = r.id
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
  fastify.get('/:id/cards', async (request, reply) => {
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
  fastify.post('/:id/cancel', async (request, reply) => {
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

  // GET /purchases/:id/status (público - verificar status do pagamento)
  fastify.get('/:id/status', async (request, reply) => {
    try {
      const { id } = request.params;

      const status = await checkPaymentStatus(id);

      return reply.send(successResponse(status));
    } catch (error) {
      console.error('Error checking payment status:', error);
      return reply.status(500).send(errorResponse('Erro ao verificar status do pagamento'));
    }
  });

  // POST /purchases/:id/refund (admin only - reembolsar compra)
  fastify.post('/:id/refund', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { reason } = request.body;

      const result = await refundPayment(id, reason);

      if (!result.success) {
        return reply.status(400).send(errorResponse('Falha ao reembolsar compra'));
      }

      // Log de auditoria
      await logAudit({
        userId: request.user.id,
        action: 'refund',
        entity: 'purchases',
        entityId: id,
        newData: { reason },
        ipAddress: request.ip
      });

      return reply.send(successResponse({ message: 'Compra reembolsada com sucesso' }));
    } catch (error) {
      console.error('Error refunding purchase:', error);
      return reply.status(500).send(errorResponse('Erro ao reembolsar compra: ' + error.message));
    }
  });

  // POST /purchases/webhook/:gateway (público - webhook de pagamento)
  fastify.post('/webhook/:gateway', async (request, reply) => {
    try {
      const { gateway } = request.params;
      const webhookData = request.body;

      console.log(`Received webhook from ${gateway}:`, JSON.stringify(webhookData));

      const result = await handlePaymentWebhook(gateway, webhookData);

      if (!result.success) {
        console.error('Webhook processing failed:', result);
      }

      // Sempre retornar 200 para o gateway
      return reply.status(200).send({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      // Sempre retornar 200 para evitar reenvios do gateway
      return reply.status(200).send({ received: true, error: error.message });
    }
  });
}
