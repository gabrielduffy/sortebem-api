import QRCode from 'qrcode';
import { customAlphabet } from 'nanoid';
import { addMinutes } from '../utils/helpers.js';

/* =========================
   PIX SERVICE (SIMULADO)
========================= */

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 32);

/**
 * Gera código PIX copia-cola (simulado)
 * Em produção, isso seria gerado pela API do banco/gateway
 *
 * @param {number} amount - Valor em reais
 * @param {number} purchaseId - ID da compra
 * @returns {Promise<Object>} Dados do PIX
 */
export async function generatePix(amount, purchaseId) {
  try {
    // Gerar código PIX simulado
    const pixCode = `00020126360014br.gov.bcb.pix0114+55859999999990204${String(purchaseId).padStart(4, '0')}52040000530398654${String(amount.toFixed(2)).padStart(8, '0')}5802BR5925SORTEBEM BENEFICENTE LTDA6014FORTALEZA6207050${String(purchaseId).padStart(5, '0')}${nanoid()}`;

    // Gerar QR Code
    const qrcode = await QRCode.toDataURL(pixCode);

    // Definir expiração (15 minutos)
    const expiration = addMinutes(new Date(), 15);

    // ID da transação (será usado para confirmar o pagamento)
    const transactionId = `TXN-${nanoid()}`;

    return {
      code: pixCode,
      qrcode,
      expiration,
      transaction_id: transactionId,
      amount
    };
  } catch (error) {
    console.error('Error generating PIX:', error);
    throw new Error('Erro ao gerar código PIX');
  }
}

/**
 * Valida código PIX (simulado)
 * @param {string} pixCode - Código PIX
 * @returns {boolean} True se válido
 */
export function validatePixCode(pixCode) {
  // Validação básica simulada
  return pixCode && pixCode.startsWith('00020126') && pixCode.length > 100;
}

/**
 * Simula consulta de status de pagamento PIX
 * Em produção, consultaria a API do banco/gateway
 *
 * @param {string} transactionId - ID da transação
 * @returns {Promise<Object>} Status do pagamento
 */
export async function checkPixStatus(transactionId) {
  // Simulação: em produção, consultaria API real
  return {
    transaction_id: transactionId,
    status: 'pending', // pending, paid, expired, cancelled
    paid_at: null,
    amount: null
  };
}

/**
 * Processa webhook de confirmação de pagamento PIX
 * @param {Object} webhookData - Dados do webhook
 * @returns {Object} Dados processados
 */
export function processPixWebhook(webhookData) {
  // Estrutura esperada do webhook (varia por gateway)
  const {
    transaction_id,
    status,
    amount,
    paid_at,
    payer_name,
    payer_document
  } = webhookData;

  return {
    transaction_id,
    status: status === 'approved' ? 'paid' : status,
    amount: parseFloat(amount),
    paid_at: paid_at ? new Date(paid_at) : null,
    payer: {
      name: payer_name,
      document: payer_document
    }
  };
}

/**
 * Gera chave PIX formatada
 * @param {string} key - Chave PIX (email, telefone, CPF, CNPJ, ou aleatória)
 * @param {string} type - Tipo da chave
 * @returns {string} Chave formatada
 */
export function formatPixKey(key, type = 'random') {
  switch (type) {
    case 'email':
      return key.toLowerCase();
    case 'phone':
      return key.replace(/\D/g, '');
    case 'cpf':
      return key.replace(/\D/g, '');
    case 'cnpj':
      return key.replace(/\D/g, '');
    case 'random':
    default:
      return key;
  }
}

/**
 * Valida chave PIX
 * @param {string} key - Chave PIX
 * @param {string} type - Tipo da chave
 * @returns {boolean} True se válida
 */
export function validatePixKey(key, type) {
  switch (type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
    case 'phone':
      const phone = key.replace(/\D/g, '');
      return phone.length >= 10 && phone.length <= 11;
    case 'cpf':
      const cpf = key.replace(/\D/g, '');
      return cpf.length === 11;
    case 'cnpj':
      const cnpj = key.replace(/\D/g, '');
      return cnpj.length === 14;
    case 'random':
      return key.length === 32;
    default:
      return false;
  }
}

/**
 * Calcula taxa de processamento (se houver)
 * @param {number} amount - Valor
 * @returns {number} Taxa
 */
export function calculatePixFee(amount) {
  // PIX geralmente não tem taxa, mas deixamos função preparada
  return 0;
}
