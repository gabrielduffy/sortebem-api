import { db } from '../config/database.js';

/* =========================
   SETTINGS HELPERS
========================= */

/**
 * Busca configuração do sistema
 * @param {string} key - Chave da configuração
 * @returns {Promise<any>} Valor da configuração
 */
export async function getSetting(key) {
  try {
    const result = await db.query(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].value;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return null;
  }
}

/**
 * Atualiza configuração do sistema
 * @param {string} key - Chave da configuração
 * @param {any} value - Valor da configuração
 * @returns {Promise<boolean>} Sucesso
 */
export async function setSetting(key, value) {
  try {
    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

/**
 * Busca múltiplas configurações
 * @param {string[]} keys - Array de chaves
 * @returns {Promise<Object>} Objeto com configurações
 */
export async function getSettings(keys) {
  try {
    const result = await db.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [keys]
    );

    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    return settings;
  } catch (error) {
    console.error('Error getting settings:', error);
    return {};
  }
}

/* =========================
   AUDIT LOG
========================= */

/**
 * Registra ação no log de auditoria
 * @param {Object} params - Parâmetros do log
 */
export async function logAudit({ userId, action, entity, entityId, oldData, newData, ipAddress }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_data, new_data, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        action,
        entity,
        entityId || null,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        ipAddress || null
      ]
    );
  } catch (error) {
    console.error('Error logging audit:', error);
  }
}

/* =========================
   PAGINATION
========================= */

/**
 * Calcula offset para paginação
 * @param {number} page - Página atual (começa em 1)
 * @param {number} limit - Items por página
 * @returns {number} Offset
 */
export function calculateOffset(page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  return (p - 1) * l;
}

/**
 * Cria objeto de metadados de paginação
 * @param {number} total - Total de items
 * @param {number} page - Página atual
 * @param {number} limit - Items por página
 * @returns {Object} Metadados de paginação
 */
export function createPaginationMeta(total, page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const totalPages = Math.ceil(total / l);

  return {
    total,
    page: p,
    limit: l,
    totalPages,
    hasNext: p < totalPages,
    hasPrev: p > 1
  };
}

/* =========================
   DATE/TIME HELPERS
========================= */

/**
 * Adiciona minutos a uma data
 * @param {Date} date - Data base
 * @param {number} minutes - Minutos a adicionar
 * @returns {Date} Nova data
 */
export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Adiciona dias a uma data
 * @param {Date} date - Data base
 * @param {number} days - Dias a adicionar
 * @returns {Date} Nova data
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Verifica se data já passou
 * @param {Date} date - Data para verificar
 * @returns {boolean} True se já passou
 */
export function isPast(date) {
  return new Date(date) < new Date();
}

/* =========================
   FORMAT HELPERS
========================= */

/**
 * Formata valor monetário
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado
 */
export function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Formata telefone
 * @param {string} phone - Telefone
 * @returns {string} Telefone formatado
 */
export function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }

  return phone;
}

/**
 * Formata CPF
 * @param {string} cpf - CPF
 * @returns {string} CPF formatado
 */
export function formatCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '');

  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
  }

  return cpf;
}

/**
 * Formata CNPJ
 * @param {string} cnpj - CNPJ
 * @returns {string} CNPJ formatado
 */
export function formatCNPJ(cnpj) {
  const cleaned = cnpj.replace(/\D/g, '');

  if (cleaned.length === 14) {
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`;
  }

  return cnpj;
}

/* =========================
   RESPONSE HELPERS
========================= */

/**
 * Resposta de sucesso padrão
 * @param {any} data - Dados da resposta
 * @returns {Object} Objeto de resposta
 */
export function successResponse(data) {
  return { ok: true, data };
}

/**
 * Resposta de erro padrão
 * @param {string} error - Mensagem de erro
 * @param {any} details - Detalhes adicionais
 * @returns {Object} Objeto de resposta
 */
export function errorResponse(error, details = null) {
  const response = { ok: false, error };
  if (details) response.details = details;
  return response;
}
