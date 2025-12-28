import * as asaasService from './asaasService.js';
import * as pagseguroService from './pagseguroService.js';
import { db } from '../config/database.js';
import { generateTransactionCode } from '../utils/codeGenerator.js';

/* =========================
   UNIFIED PAYMENT SERVICE
   - Gerencia pagamentos entre múltiplos gateways
   - Roteamento automático baseado em configurações
   - Registro de transações e logs
========================= */

/**
 * Busca configuração de gateway ativa
 */
async function getActiveGatewayConfig() {
  const result = await db.query(
    "SELECT value FROM settings WHERE key = 'gateway_config'"
  );

  if (!result.rows[0]) {
    throw new Error('Configuração de gateway não encontrada');
  }

  return result.rows[0].value;
}

/**
 * Determina qual gateway usar baseado na configuração e método de pagamento
 * @param {string} paymentMethod - 'pix' ou 'credit_card'
 * @returns {string} 'asaas' ou 'pagseguro'
 */
async function selectGateway(paymentMethod) {
  const config = await getActiveGatewayConfig();

  // PIX: usa gateway ativo (default: asaas)
  if (paymentMethod === 'pix') {
    return config.active_gateway || 'asaas';
  }

  // Cartão de crédito: sempre PagSeguro
  if (paymentMethod === 'credit_card') {
    return 'pagseguro';
  }

  throw new Error('Método de pagamento inválido');
}

/**
 * Cria cobrança PIX
 * @param {Object} params - Parâmetros da cobrança
 * @param {Object} params.purchase - Dados da compra
 * @param {Object} params.customer - Dados do cliente
 * @returns {Promise<Object>} Dados da cobrança
 */
export async function createPixPayment(params) {
  const { purchase, customer } = params;
  const gateway = await selectGateway('pix');
  const transactionCode = generateTransactionCode();

  console.log('💳 createPixPayment chamado:', { purchaseId: purchase.id, gateway, customer });

  try {
    let chargeData;

    // Preparar dados do customer com valores padrão
    const customerData = {
      cpfCnpj: customer?.cpf || null,
      name: customer?.name || 'Cliente SORTEBEM',
      email: customer?.email || `cliente-${purchase.id}@sortebem.com.br`,
      phone: customer?.phone || null
    };

    console.log('👤 Customer data preparado:', customerData);

    if (gateway === 'asaas') {
      // Criar/buscar cliente no Asaas
      const customerId = await asaasService.getOrCreateCustomer(customerData);

      // Criar cobrança PIX
      chargeData = await asaasService.createPixCharge({
        customer: customerId,
        value: purchase.total_amount,
        description: `SORTEBEM - ${purchase.quantity} cartela(s) - Rodada #${purchase.round_id}`,
        expirationMinutes: 2
      });
    } else if (gateway === 'pagseguro') {
      // PagSeguro trabalha em centavos
      chargeData = await pagseguroService.createPixCharge({
        customer: customerData,
        value: Math.round(purchase.total_amount * 100),
        description: `SORTEBEM - ${purchase.quantity} cartela(s) - Rodada #${purchase.round_id}`,
        expirationMinutes: 2
      });
    }

    console.log('✅ Charge criado no gateway:', { id: chargeData.id, gateway });

    // Atualizar purchase com dados do gateway
    await db.query(
      `UPDATE purchases
       SET transaction_code = $1,
           gateway = $2,
           gateway_transaction_id = $3,
           gateway_response = $4,
           expires_at = $5
       WHERE id = $6`,
      [
        transactionCode,
        gateway,
        chargeData.id,
        JSON.stringify(chargeData),
        chargeData.expiresAt,
        purchase.id
      ]
    );

    return {
      id: chargeData.id,
      transactionCode,
      gateway,
      gatewayTransactionId: chargeData.id,
      pixCopyPaste: chargeData.pixCopyPaste,
      pixQrCode: chargeData.pixQrCode,
      expiresAt: chargeData.expiresAt,
      value: purchase.total_amount
    };

  } catch (error) {
    console.error('❌ Erro ao criar pagamento PIX:', error);
    console.error('Stack:', error.stack);

    // Registrar erro na purchase
    await db.query(
      `UPDATE purchases
       SET payment_status = 'failed',
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify({ error: error.message }), purchase.id]
    );

    throw error;
  }
}

/**
 * Cria cobrança com Cartão de Crédito
 * @param {Object} params - Parâmetros da cobrança
 * @returns {Promise<Object>} Dados da cobrança
 */
export async function createCreditCardPayment(params) {
  const { purchase, customer, cardToken, installments, holder } = params;
  const gateway = 'pagseguro'; // Cartão sempre via PagSeguro
  const transactionCode = generateTransactionCode();

  console.log('💳 createCreditCardPayment chamado:', { purchaseId: purchase.id, gateway, customer });

  try {
    // Preparar dados do customer com valores padrão
    const customerData = {
      name: customer?.name || holder?.name || 'Cliente SORTEBEM',
      email: customer?.email || `cliente-${purchase.id}@sortebem.com.br`,
      cpfCnpj: customer?.cpf || holder?.cpf || null,
      phone: customer?.phone || null
    };

    console.log('👤 Customer data preparado:', customerData);

    // PagSeguro trabalha em centavos
    const chargeData = await pagseguroService.createCreditCardCharge({
      customer: customerData,
      value: Math.round(purchase.total_amount * 100),
      description: `SORTEBEM - ${purchase.quantity} cartela(s) - Rodada #${purchase.round_id}`,
      cardToken,
      installments,
      holder
    });

    console.log('✅ Charge criado no gateway:', { id: chargeData.id, status: chargeData.status });

    // Atualizar purchase com dados do gateway
    await db.query(
      `UPDATE purchases
       SET transaction_code = $1,
           gateway = $2,
           gateway_transaction_id = $3,
           gateway_response = $4,
           payment_status = $5
       WHERE id = $6`,
      [
        transactionCode,
        gateway,
        chargeData.id,
        JSON.stringify(chargeData),
        chargeData.status === 'AUTHORIZED' || chargeData.status === 'PAID' ? 'paid' : 'pending',
        purchase.id
      ]
    );

    // Se pagamento aprovado, processar
    if (chargeData.status === 'AUTHORIZED' || chargeData.status === 'PAID') {
      await processSuccessfulPayment(purchase.id);
    }

    return {
      id: chargeData.id,
      transactionCode,
      gateway,
      gatewayTransactionId: chargeData.id,
      status: chargeData.status,
      installments: chargeData.installments,
      value: purchase.total_amount
    };

  } catch (error) {
    console.error('❌ Erro ao criar pagamento cartão:', error);
    console.error('Stack:', error.stack);

    await db.query(
      `UPDATE purchases
       SET payment_status = 'failed',
           gateway_response = $1
       WHERE id = $2`,
      [JSON.stringify({ error: error.message }), purchase.id]
    );

    throw error;
  }
}

/**
 * Verifica status de pagamento
 * @param {number} purchaseId - ID da compra
 * @returns {Promise<Object>} Status do pagamento
 */
export async function checkPaymentStatus(purchaseId) {
  const result = await db.query(
    `SELECT id, gateway, gateway_transaction_id, payment_status, transaction_code
     FROM purchases WHERE id = $1`,
    [purchaseId]
  );

  if (result.rows.length === 0) {
    throw new Error('Compra não encontrada');
  }

  const purchase = result.rows[0];

  if (!purchase.gateway_transaction_id) {
    return {
      status: purchase.payment_status,
      transactionCode: purchase.transaction_code
    };
  }

  try {
    let paymentStatus;

    if (purchase.gateway === 'asaas') {
      paymentStatus = await asaasService.checkPaymentStatus(purchase.gateway_transaction_id);
    } else if (purchase.gateway === 'pagseguro') {
      paymentStatus = await pagseguroService.checkPaymentStatus(purchase.gateway_transaction_id);
    }

    // Atualizar status se mudou
    const newStatus = mapGatewayStatus(paymentStatus.status, purchase.gateway);

    if (newStatus !== purchase.payment_status) {
      await db.query(
        `UPDATE purchases
         SET payment_status = $1,
             gateway_response = $2,
             paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END
         WHERE id = $3`,
        [newStatus, JSON.stringify(paymentStatus), purchaseId]
      );

      // Se pagamento confirmado, processar
      if (newStatus === 'paid' && purchase.payment_status !== 'paid') {
        await processSuccessfulPayment(purchaseId);
      }
    }

    return {
      status: newStatus,
      transactionCode: purchase.transaction_code,
      gatewayStatus: paymentStatus.status,
      paidAt: paymentStatus.paymentDate || paymentStatus.paidAt
    };

  } catch (error) {
    console.error('Erro ao verificar status do pagamento:', error);
    return {
      status: purchase.payment_status,
      transactionCode: purchase.transaction_code,
      error: error.message
    };
  }
}

/**
 * Mapeia status do gateway para status interno
 */
function mapGatewayStatus(gatewayStatus, gateway) {
  if (gateway === 'asaas') {
    const statusMap = {
      'PENDING': 'pending',
      'RECEIVED': 'paid',
      'CONFIRMED': 'paid',
      'OVERDUE': 'expired',
      'REFUNDED': 'refunded',
      'RECEIVED_IN_CASH': 'paid',
      'REFUND_REQUESTED': 'refunding',
      'CHARGEBACK_REQUESTED': 'disputed',
      'CHARGEBACK_DISPUTE': 'disputed',
      'AWAITING_CHARGEBACK_REVERSAL': 'disputed'
    };
    return statusMap[gatewayStatus] || 'pending';
  }

  if (gateway === 'pagseguro') {
    const statusMap = {
      'PENDING': 'pending',
      'PAID': 'paid',
      'CONFIRMED': 'paid',
      'DECLINED': 'failed',
      'CANCELED': 'cancelled',
      'AUTHORIZED': 'paid'
    };
    return statusMap[gatewayStatus] || 'pending';
  }

  return 'pending';
}

/**
 * Processa pagamento bem-sucedido
 * @param {number} purchaseId - ID da compra
 */
async function processSuccessfulPayment(purchaseId) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Buscar dados da compra
    const purchaseResult = await client.query(
      `SELECT p.*, r.establishment_id, r.manager_id, r.charity_id, r.card_price,
              e.commission_rate as establishment_commission,
              m.commission_rate as manager_commission
       FROM purchases p
       LEFT JOIN rounds r ON p.round_id = r.id
       LEFT JOIN establishments e ON r.establishment_id = e.id
       LEFT JOIN managers m ON r.manager_id = m.id
       WHERE p.id = $1`,
      [purchaseId]
    );

    const purchase = purchaseResult.rows[0];

    if (!purchase) {
      throw new Error('Compra não encontrada');
    }

    // Buscar configuração de split
    const splitConfig = await client.query(
      "SELECT value FROM settings WHERE key = 'split_config'"
    );
    const split = splitConfig.rows[0].value;

    // Calcular valores
    const totalAmount = purchase.total_amount;
    const prizeAmount = totalAmount * (split.prize_percentage / 100);
    const charityAmount = totalAmount * (split.charity_percentage / 100);
    const platformAmount = totalAmount * (split.platform_percentage / 100);

    // Comissões (do total de comissões)
    const totalCommission = totalAmount * (split.commission_percentage / 100);
    const establishmentCommission = totalCommission * (purchase.establishment_commission / 100);
    const managerCommission = totalCommission * (purchase.manager_commission / 100);

    // Atualizar saldos
    if (purchase.establishment_id) {
      await client.query(
        `UPDATE establishments
         SET balance = balance + $1
         WHERE id = $2`,
        [establishmentCommission, purchase.establishment_id]
      );
    }

    if (purchase.manager_id) {
      await client.query(
        `UPDATE managers
         SET balance = balance + $1
         WHERE id = $2`,
        [managerCommission, purchase.manager_id]
      );
    }

    if (purchase.charity_id) {
      await client.query(
        `UPDATE charities
         SET total_received = total_received + $1
         WHERE id = $2`,
        [charityAmount, purchase.charity_id]
      );
    }

    // Atualizar totais da rodada
    await client.query(
      `UPDATE rounds
       SET total_sales = total_sales + $1,
           prize_pool = prize_pool + $2,
           charity_amount = charity_amount + $3
       WHERE id = $4`,
      [totalAmount, prizeAmount, charityAmount, purchase.round_id]
    );

    // Marcar cartelas como vendidas
    await client.query(
      `UPDATE cards
       SET status = 'sold'
       WHERE purchase_id = $1`,
      [purchaseId]
    );

    await client.query('COMMIT');

    // Enviar cartelas por WhatsApp (não bloqueia)
    sendCardsViaWhatsApp(purchaseId).catch(err => {
      console.error('Erro ao enviar cartelas por WhatsApp:', err);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Envia cartelas por WhatsApp
 */
async function sendCardsViaWhatsApp(purchaseId) {
  try {
    const { sendPurchaseCards } = await import('./whatsappService.js');
    await sendPurchaseCards(purchaseId);
  } catch (error) {
    console.error('Erro ao enviar cartelas por WhatsApp:', error);
  }
}

/**
 * Reembolsa pagamento
 * @param {number} purchaseId - ID da compra
 * @param {string} reason - Motivo do reembolso
 * @returns {Promise<Object>} Dados do reembolso
 */
export async function refundPayment(purchaseId, reason = '') {
  const result = await db.query(
    `SELECT gateway, gateway_transaction_id, total_amount, payment_status
     FROM purchases WHERE id = $1`,
    [purchaseId]
  );

  if (result.rows.length === 0) {
    throw new Error('Compra não encontrada');
  }

  const purchase = result.rows[0];

  if (purchase.payment_status !== 'paid') {
    throw new Error('Apenas compras pagas podem ser reembolsadas');
  }

  try {
    let refundData;

    if (purchase.gateway === 'asaas') {
      refundData = await asaasService.refundPayment(
        purchase.gateway_transaction_id,
        null,
        reason
      );
    } else if (purchase.gateway === 'pagseguro') {
      refundData = await pagseguroService.refundPayment(
        purchase.gateway_transaction_id,
        Math.round(purchase.total_amount * 100)
      );
    }

    // Atualizar purchase
    await db.query(
      `UPDATE purchases
       SET payment_status = 'refunded',
           refunded_at = NOW(),
           refund_reason = $1,
           gateway_response = $2
       WHERE id = $3`,
      [reason, JSON.stringify(refundData), purchaseId]
    );

    // Reverter cartelas para disponíveis
    await db.query(
      `UPDATE cards
       SET status = 'available',
           purchase_id = NULL,
           user_id = NULL
       WHERE purchase_id = $1`,
      [purchaseId]
    );

    return {
      success: true,
      refundData
    };

  } catch (error) {
    console.error('Erro ao reembolsar pagamento:', error);
    throw error;
  }
}

/**
 * Processa webhook de pagamento
 * @param {string} gateway - Gateway que enviou o webhook
 * @param {Object} webhookData - Dados do webhook
 */
export async function handlePaymentWebhook(gateway, webhookData) {
  try {
    let processedData;

    if (gateway === 'asaas') {
      processedData = await asaasService.handleWebhook(webhookData);
    } else if (gateway === 'pagseguro') {
      processedData = await pagseguroService.handleWebhook(webhookData);
    } else {
      throw new Error('Gateway inválido');
    }

    // Buscar purchase pelo gateway_transaction_id
    const result = await db.query(
      `SELECT id, payment_status FROM purchases
       WHERE gateway_transaction_id = $1 AND gateway = $2`,
      [processedData.paymentId || processedData.orderId, gateway]
    );

    if (result.rows.length === 0) {
      console.log('Purchase não encontrada para webhook:', processedData);
      return { success: false, message: 'Purchase não encontrada' };
    }

    const purchase = result.rows[0];
    const newStatus = mapGatewayStatus(processedData.status, gateway);

    // Atualizar status se necessário
    if (newStatus !== purchase.payment_status) {
      await db.query(
        `UPDATE purchases
         SET payment_status = $1,
             gateway_response = $2,
             paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END
         WHERE id = $3`,
        [newStatus, JSON.stringify(processedData), purchase.id]
      );

      // Se pagamento confirmado, processar
      if (newStatus === 'paid' && purchase.payment_status !== 'paid') {
        await processSuccessfulPayment(purchase.id);
      }
    }

    return { success: true, status: newStatus };

  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    return { success: false, error: error.message };
  }
}
