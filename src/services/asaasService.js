import fetch from 'node-fetch';
import { db } from '../config/database.js';

/* =========================
   ASAAS PAYMENT SERVICE
   - Integração com gateway Asaas
   - Suporte PIX
   - Sandbox e Produção
========================= */

/**
 * Busca configuração do Asaas
 */
async function getAsaasConfig() {
  const result = await db.query(
    "SELECT value FROM settings WHERE key = 'gateway_config'"
  );

  if (!result.rows[0]) {
    throw new Error('Configuração do gateway não encontrada');
  }

  const config = result.rows[0].value;
  const asaasConfig = config.asaas;

  if (!asaasConfig || !asaasConfig.api_key) {
    throw new Error('Configuração do Asaas não encontrada');
  }

  return asaasConfig;
}

/**
 * Faz requisição à API do Asaas
 */
async function asaasRequest(endpoint, method = 'GET', data = null) {
  const config = await getAsaasConfig();
  const baseUrl = config.sandbox
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://www.asaas.com/api/v3';

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': config.api_key
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.errors?.[0]?.description || 'Erro na requisição Asaas');
  }

  return responseData;
}

/**
 * Cria cobrança PIX no Asaas
 * @param {Object} params - Parâmetros da cobrança
 * @param {string} params.customer - ID do cliente no Asaas
 * @param {number} params.value - Valor da cobrança
 * @param {string} params.description - Descrição da cobrança
 * @param {number} params.expirationMinutes - Minutos para expiração (padrão: 2)
 * @returns {Promise<Object>} Dados da cobrança criada
 */
export async function createPixCharge(params) {
  const { customer, value, description, expirationMinutes = 2 } = params;

  // Criar cobrança
  const chargeData = {
    customer,
    billingType: 'PIX',
    value,
    description,
    dueDate: new Date().toISOString().split('T')[0], // Hoje
  };

  const charge = await asaasRequest('/payments', 'POST', chargeData);

  // Gerar QR Code PIX
  const pixData = await asaasRequest(`/payments/${charge.id}/pixQrCode`);

  return {
    id: charge.id,
    status: charge.status,
    value: charge.value,
    dueDate: charge.dueDate,
    invoiceUrl: charge.invoiceUrl,
    pixCopyPaste: pixData.payload,
    pixQrCode: pixData.encodedImage,
    expiresAt: new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()
  };
}

/**
 * Verifica status de pagamento no Asaas
 * @param {string} chargeId - ID da cobrança no Asaas
 * @returns {Promise<Object>} Status do pagamento
 */
export async function checkPaymentStatus(chargeId) {
  const charge = await asaasRequest(`/payments/${chargeId}`);

  return {
    id: charge.id,
    status: charge.status, // PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, etc
    value: charge.value,
    netValue: charge.netValue,
    billingType: charge.billingType,
    confirmedDate: charge.confirmedDate,
    paymentDate: charge.paymentDate
  };
}

/**
 * Reembolsa pagamento no Asaas
 * @param {string} chargeId - ID da cobrança no Asaas
 * @param {number} value - Valor a reembolsar (opcional, reembolsa tudo se não informado)
 * @param {string} description - Motivo do reembolso
 * @returns {Promise<Object>} Dados do reembolso
 */
export async function refundPayment(chargeId, value = null, description = '') {
  const refundData = {
    description
  };

  if (value) {
    refundData.value = value;
  }

  const refund = await asaasRequest(`/payments/${chargeId}/refund`, 'POST', refundData);

  return {
    id: refund.id,
    status: refund.status,
    value: refund.value,
    description: refund.description,
    refundedDate: refund.refundedDate
  };
}

/**
 * Cria ou busca cliente no Asaas
 * @param {Object} customerData - Dados do cliente
 * @param {string} customerData.cpfCnpj - CPF ou CNPJ
 * @param {string} customerData.name - Nome completo
 * @param {string} customerData.email - Email
 * @param {string} customerData.phone - Telefone
 * @returns {Promise<string>} ID do cliente no Asaas
 */
export async function getOrCreateCustomer(customerData) {
  const { cpfCnpj, name, email, phone } = customerData;

  // Tentar buscar cliente existente por CPF/CNPJ
  try {
    const customers = await asaasRequest(`/customers?cpfCnpj=${cpfCnpj}`);
    if (customers.data && customers.data.length > 0) {
      return customers.data[0].id;
    }
  } catch (error) {
    console.log('Cliente não encontrado, criando novo...');
  }

  // Criar novo cliente
  const newCustomer = await asaasRequest('/customers', 'POST', {
    name,
    cpfCnpj,
    email,
    phone: phone?.replace(/\D/g, ''),
    notificationDisabled: true
  });

  return newCustomer.id;
}

/**
 * Webhook handler para notificações do Asaas
 * @param {Object} webhookData - Dados do webhook
 * @returns {Promise<Object>} Dados processados
 */
export async function handleWebhook(webhookData) {
  const { event, payment } = webhookData;

  // Eventos possíveis:
  // PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_CONFIRMED,
  // PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED, etc

  return {
    event,
    paymentId: payment.id,
    status: payment.status,
    value: payment.value,
    confirmedDate: payment.confirmedDate,
    paymentDate: payment.paymentDate
  };
}

/**
 * Testa configuração do Asaas
 * @returns {Promise<boolean>} True se configuração está válida
 */
export async function testAsaasConfig() {
  try {
    await asaasRequest('/myAccount');
    return true;
  } catch (error) {
    console.error('Erro ao testar configuração Asaas:', error);
    return false;
  }
}
