import { db } from '../config/database.js';

/* =========================
   WHATSAPP SERVICE
========================= */

/**
 * Envia cartelas de uma compra por WhatsApp
 * @param {number} purchaseId - ID da compra
 * @returns {Promise<Object>} Resultado do envio
 */
export async function sendPurchaseCards(purchaseId) {
  try {
    // Buscar dados da compra, usuário, cartelas e rodada
    const result = await db.query(
      `SELECT
        p.id, p.user_id, p.round_id,
        u.name as user_name, u.email, u.phone,
        r.number as round_number, r.type as round_type, r.starts_at, r.id as round_id,
        array_agg(c.code) as card_codes
       FROM purchases p
       JOIN users u ON p.user_id = u.id
       JOIN rounds r ON p.round_id = r.id
       JOIN cards c ON c.purchase_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, u.name, u.email, u.phone, r.number, r.type, r.starts_at, r.id`,
      [purchaseId]
    );

    if (result.rows.length === 0) {
      throw new Error('Compra não encontrada');
    }

    const purchase = result.rows[0];

    if (!purchase.phone) {
      console.log('Usuário sem telefone cadastrado');
      return { success: false, error: 'Telefone não cadastrado' };
    }

    // Enviar cartelas
    return await sendCardsViaWhatsApp(
      purchase.phone,
      purchase.card_codes,
      {
        id: purchase.round_id,
        number: purchase.round_number,
        type: purchase.round_type,
        starts_at: purchase.starts_at
      }
    );

  } catch (error) {
    console.error('Error sending purchase cards:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envia cartelas por WhatsApp
 * @param {string} phone - Número do WhatsApp
 * @param {string[]} cardCodes - Códigos das cartelas
 * @param {Object} roundInfo - Informações da rodada
 * @returns {Promise<Object>} Resultado do envio
 */
export async function sendCardsViaWhatsApp(phone, cardCodes, roundInfo) {
  try {
    // Buscar configuração do WhatsApp via settings
    const configResult = await db.query(
      "SELECT value FROM settings WHERE key = 'whatsapp_config'"
    );

    if (configResult.rows.length === 0 || !configResult.rows[0].value.is_active) {
      console.log('WhatsApp not configured or inactive');
      return {
        success: false,
        error: 'WhatsApp não configurado'
      };
    }

    const config = configResult.rows[0].value;

    // Montar mensagem
    const message = buildCardMessage(cardCodes, roundInfo, config.message_template);

    // Enviar via API do WhatsApp
    const result = await sendWhatsAppMessage(
      config.api_url,
      config.api_key,
      config.sender_number,
      phone,
      message
    );

    // Registrar log
    await db.query(
      `INSERT INTO whatsapp_logs (phone, card_codes, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [
        phone,
        cardCodes,
        result.success ? 'sent' : 'failed',
        result.error || null
      ]
    );

    return result;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);

    // Registrar log de erro
    await db.query(
      `INSERT INTO whatsapp_logs (phone, card_codes, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [phone, cardCodes, 'failed', error.message]
    );

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Constrói mensagem de envio de cartelas
 * @param {string[]} cardCodes - Códigos das cartelas
 * @param {Object} roundInfo - Informações da rodada
 * @param {string} template - Template da mensagem
 * @returns {string} Mensagem formatada
 */
function buildCardMessage(cardCodes, roundInfo, template) {
  // Se houver template customizado
  if (template) {
    return template
      .replace('{cards}', cardCodes.join(', '))
      .replace('{round_number}', roundInfo.number)
      .replace('{round_type}', roundInfo.type === 'regular' ? 'Regular' : 'Especial')
      .replace('{starts_at}', new Date(roundInfo.starts_at).toLocaleString('pt-BR'));
  }

  // Template padrão
  const cardsText = cardCodes.map(code => `🎫 *${code}*`).join('\n');

  return `🎉 *SORTEBEM - Suas Cartelas!* 🎉

Olá! Aqui estão suas cartelas para a rodada #${roundInfo.number} (${roundInfo.type === 'regular' ? 'Regular' : 'Especial'}):

${cardsText}

📅 *Sorteio:* ${new Date(roundInfo.starts_at).toLocaleString('pt-BR')}

🔗 *Acompanhe ao vivo:*
https://sortebem.com.br/live/${roundInfo.id}

🍀 *Boa sorte!*

_Guarde bem seus códigos. Você precisará deles para resgatar o prêmio caso ganhe._`;
}

/**
 * Envia mensagem via API do WhatsApp
 * @param {string} apiUrl - URL da API
 * @param {string} apiKey - Chave da API
 * @param {string} from - Número remetente
 * @param {string} to - Número destinatário
 * @param {string} message - Mensagem
 * @returns {Promise<Object>} Resultado
 */
async function sendWhatsAppMessage(apiUrl, apiKey, from, to, message) {
  try {
    // Limpar número (remover caracteres especiais)
    const cleanPhone = to.replace(/\D/g, '');

    // Fazer requisição para API do WhatsApp
    // Isso varia dependendo do provedor (Twilio, Evolution API, etc)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        number: cleanPhone,
        message: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Erro ao enviar mensagem');
    }

    const data = await response.json();

    return {
      success: true,
      message_id: data.id || data.messageId,
      data
    };
  } catch (error) {
    console.error('WhatsApp API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envia notificação de vitória
 * @param {string} phone - Número do WhatsApp
 * @param {string} cardCode - Código da cartela vencedora
 * @param {number} prizeAmount - Valor do prêmio
 * @returns {Promise<Object>} Resultado
 */
export async function sendWinnerNotification(phone, cardCode, prizeAmount) {
  try {
    const configResult = await db.query(
      "SELECT value FROM settings WHERE key = 'whatsapp_config'"
    );

    if (configResult.rows.length === 0 || !configResult.rows[0].value.is_active) {
      return { success: false, error: 'WhatsApp não configurado' };
    }

    const config = configResult.rows[0].value;

    const message = `🎊 *PARABÉNS! VOCÊ GANHOU!* 🎊

Sua cartela *${cardCode}* foi sorteada!

💰 *Prêmio:* R$ ${prizeAmount.toFixed(2).replace('.', ',')}

🏆 Para resgatar seu prêmio:
1. Acesse https://sortebem.com.br/prize
2. Informe o código da cartela: ${cardCode}
3. Cadastre sua chave PIX
4. Receba seu prêmio!

_Parabéns novamente!_ 🎉`;

    const result = await sendWhatsAppMessage(
      config.api_url,
      config.api_key,
      config.sender_number,
      phone,
      message
    );

    return result;
  } catch (error) {
    console.error('Error sending winner notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Testa configuração do WhatsApp
 * @param {string} testPhone - Número para teste
 * @returns {Promise<Object>} Resultado do teste
 */
export async function testWhatsAppConfig(testPhone) {
  try {
    const configResult = await db.query(
      "SELECT value FROM settings WHERE key = 'whatsapp_config'"
    );

    if (configResult.rows.length === 0) {
      return { success: false, error: 'WhatsApp não configurado' };
    }

    const config = configResult.rows[0].value;

    const testMessage = `🧪 *SORTEBEM - Teste de Configuração*

Esta é uma mensagem de teste do sistema SORTEBEM.

Se você recebeu esta mensagem, a integração com WhatsApp está funcionando corretamente! ✅`;

    const result = await sendWhatsAppMessage(
      config.api_url,
      config.api_key,
      config.sender_number,
      testPhone,
      testMessage
    );

    return result;
  } catch (error) {
    console.error('Error testing WhatsApp:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
