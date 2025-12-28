import fetch from 'node-fetch';
import { db } from '../config/database.js';

/* =========================
   PAGSEGURO PAYMENT SERVICE
   - Integração com gateway PagSeguro
   - Suporte PIX e Cartão de Crédito
   - Sandbox e Produção
========================= */

/**
 * Busca configuração do PagSeguro
 */
async function getPagSeguroConfig() {
  const result = await db.query(
    "SELECT value FROM settings WHERE key = 'gateway_config'"
  );

  if (!result.rows[0]) {
    throw new Error('Configuração do gateway não encontrada');
  }

  const config = result.rows[0].value;
  const pagSeguroConfig = config.pagseguro;

  if (!pagSeguroConfig || !pagSeguroConfig.token) {
    throw new Error('Configuração do PagSeguro não encontrada');
  }

  return pagSeguroConfig;
}

/**
 * Faz requisição à API do PagSeguro
 */
async function pagSeguroRequest(endpoint, method = 'GET', data = null) {
  const config = await getPagSeguroConfig();
  const baseUrl = config.sandbox
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com';

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error_messages?.[0]?.description || 'Erro na requisição PagSeguro');
  }

  return responseData;
}

/**
 * Cria cobrança PIX no PagSeguro
 * @param {Object} params - Parâmetros da cobrança
 * @param {string} params.customer - Dados do cliente
 * @param {number} params.value - Valor da cobrança (em centavos)
 * @param {string} params.description - Descrição da cobrança
 * @param {number} params.expirationMinutes - Minutos para expiração (padrão: 2)
 * @returns {Promise<Object>} Dados da cobrança criada
 */
export async function createPixCharge(params) {
  const { customer, value, description, expirationMinutes = 2 } = params;

  const expirationDate = new Date();
  expirationDate.setMinutes(expirationDate.getMinutes() + expirationMinutes);

  const chargeData = {
    reference_id: `SORTEBEM-${Date.now()}`,
    customer: {
      name: customer.name,
      email: customer.email,
      tax_id: customer.cpfCnpj?.replace(/\D/g, ''),
      phones: customer.phone ? [{
        country: '55',
        area: customer.phone.replace(/\D/g, '').substring(0, 2),
        number: customer.phone.replace(/\D/g, '').substring(2),
        type: 'MOBILE'
      }] : []
    },
    items: [{
      name: description,
      quantity: 1,
      unit_amount: value // em centavos
    }],
    qr_codes: [{
      amount: {
        value: value
      },
      expiration_date: expirationDate.toISOString()
    }],
    notification_urls: [
      // URL será configurada via settings
    ]
  };

  const charge = await pagSeguroRequest('/orders', 'POST', chargeData);

  return {
    id: charge.id,
    status: charge.status,
    value: value / 100,
    referenceId: charge.reference_id,
    pixCopyPaste: charge.qr_codes[0].text,
    pixQrCode: charge.qr_codes[0].links[0].href,
    expiresAt: expirationDate.toISOString()
  };
}

/**
 * Cria cobrança com Cartão de Crédito no PagSeguro
 * @param {Object} params - Parâmetros da cobrança
 * @returns {Promise<Object>} Dados da cobrança criada
 */
export async function createCreditCardCharge(params) {
  const {
    customer,
    value,
    description,
    cardToken,
    installments = 1,
    holder
  } = params;

  const chargeData = {
    reference_id: `SORTEBEM-${Date.now()}`,
    customer: {
      name: customer.name,
      email: customer.email,
      tax_id: customer.cpfCnpj?.replace(/\D/g, ''),
      phones: customer.phone ? [{
        country: '55',
        area: customer.phone.replace(/\D/g, '').substring(0, 2),
        number: customer.phone.replace(/\D/g, '').substring(2),
        type: 'MOBILE'
      }] : []
    },
    items: [{
      name: description,
      quantity: 1,
      unit_amount: value // em centavos
    }],
    charges: [{
      reference_id: `CHARGE-${Date.now()}`,
      description: description,
      amount: {
        value: value,
        currency: 'BRL'
      },
      payment_method: {
        type: 'CREDIT_CARD',
        installments: installments,
        capture: true,
        card: {
          encrypted: cardToken,
          holder: {
            name: holder.name
          }
        }
      }
    }]
  };

  const charge = await pagSeguroRequest('/orders', 'POST', chargeData);

  return {
    id: charge.id,
    status: charge.charges[0].status,
    value: value / 100,
    referenceId: charge.reference_id,
    installments: installments,
    chargeId: charge.charges[0].id
  };
}

/**
 * Verifica status de pagamento no PagSeguro
 * @param {string} orderId - ID do pedido no PagSeguro
 * @returns {Promise<Object>} Status do pagamento
 */
export async function checkPaymentStatus(orderId) {
  const order = await pagSeguroRequest(`/orders/${orderId}`);

  let status = 'PENDING';
  if (order.status === 'PAID') {
    status = 'CONFIRMED';
  } else if (order.status === 'DECLINED' || order.status === 'CANCELED') {
    status = 'FAILED';
  }

  return {
    id: order.id,
    status: status,
    value: order.charges?.[0]?.amount?.value / 100 || 0,
    paymentMethod: order.charges?.[0]?.payment_method?.type,
    paidAt: order.charges?.[0]?.paid_at,
    referenceId: order.reference_id
  };
}

/**
 * Reembolsa pagamento no PagSeguro
 * @param {string} chargeId - ID da cobrança no PagSeguro
 * @param {number} value - Valor a reembolsar em centavos (opcional, reembolsa tudo se não informado)
 * @returns {Promise<Object>} Dados do reembolso
 */
export async function refundPayment(chargeId, value = null) {
  const refundData = {};

  if (value) {
    refundData.amount = {
      value: value
    };
  }

  const refund = await pagSeguroRequest(`/charges/${chargeId}/cancel`, 'POST', refundData);

  return {
    id: refund.id,
    status: refund.status,
    value: refund.amount?.value / 100 || 0,
    canceledAt: refund.canceled_at
  };
}

/**
 * Gera token de cartão (para frontend)
 * Nota: Esta função deve ser chamada do frontend usando a biblioteca PagSeguro JS
 * Esta é apenas uma referência de como seria a estrutura
 */
export function getCardTokenizationInfo() {
  return {
    message: 'A tokenização do cartão deve ser feita no frontend usando PagSeguro.js',
    library: 'https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js',
    usage: `
      // No frontend:
      const card = PagSeguro.encryptCard({
        publicKey: 'SUA_PUBLIC_KEY',
        holder: cardHolder,
        number: cardNumber,
        expMonth: expMonth,
        expYear: expYear,
        securityCode: cvv
      });

      // Enviar card.encryptedCard para o backend
    `
  };
}

/**
 * Webhook handler para notificações do PagSeguro
 * @param {Object} webhookData - Dados do webhook
 * @returns {Promise<Object>} Dados processados
 */
export async function handleWebhook(webhookData) {
  const { id, reference_id, charges } = webhookData;

  return {
    orderId: id,
    referenceId: reference_id,
    status: charges?.[0]?.status,
    paymentMethod: charges?.[0]?.payment_method?.type,
    value: charges?.[0]?.amount?.value / 100 || 0,
    paidAt: charges?.[0]?.paid_at
  };
}

/**
 * Testa configuração do PagSeguro
 * @returns {Promise<boolean>} True se configuração está válida
 */
export async function testPagSeguroConfig() {
  try {
    // Tenta fazer uma requisição simples para validar o token
    await pagSeguroRequest('/orders?limit=1');
    return true;
  } catch (error) {
    console.error('Erro ao testar configuração PagSeguro:', error);
    return false;
  }
}

/**
 * Busca meios de pagamento disponíveis
 */
export async function getPaymentMethods() {
  try {
    const methods = await pagSeguroRequest('/payment-methods');
    return methods;
  } catch (error) {
    console.error('Erro ao buscar meios de pagamento:', error);
    return null;
  }
}

/**
 * Calcula parcelas disponíveis
 * @param {number} amount - Valor em centavos
 * @param {number} maxInstallments - Número máximo de parcelas
 * @returns {Array} Lista de parcelas disponíveis
 */
export function calculateInstallments(amount, maxInstallments = 12) {
  const installments = [];
  const minInstallmentValue = 500; // R$ 5,00 mínimo por parcela

  for (let i = 1; i <= maxInstallments; i++) {
    const installmentValue = amount / i;

    if (installmentValue >= minInstallmentValue) {
      installments.push({
        quantity: i,
        value: installmentValue / 100,
        totalValue: amount / 100,
        interestFree: i <= 3 // Até 3x sem juros
      });
    }
  }

  return installments;
}
