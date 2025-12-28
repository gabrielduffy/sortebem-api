import { db, redis } from '../config/database.js';
import { getSetting } from '../utils/helpers.js';
import { addMinutes } from '../utils/helpers.js';

/* =========================
   ROUND MANAGER SERVICE
========================= */

/**
 * Cria próxima rodada automaticamente
 * @param {string} type - Tipo da rodada (regular ou special)
 * @returns {Promise<Object>} Rodada criada
 */
export async function createNextRound(type = 'regular') {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Buscar configurações de rodada via settings
    const roundConfigResult = await client.query(
      "SELECT value FROM settings WHERE key = 'round_config'"
    );

    let roundConfig = roundConfigResult.rows[0]?.value || {
      regular: { selling_minutes: 7, closed_minutes: 3, card_price: 5 },
      special: { selling_minutes: 57, closed_minutes: 3, card_price: 10 }
    };
    
    // Parse se vier como string
    if (typeof roundConfig === 'string') {
      roundConfig = JSON.parse(roundConfig);
    }

    const config = type === 'regular' ? roundConfig.regular : roundConfig.special;

    // Buscar preço da cartela (usa do config ou fallback para settings antigo)
    const cardPrice = config.card_price || (type === 'regular'
      ? await getSetting('card_price_regular')
      : await getSetting('card_price_special'));

    const maxCards = roundConfig.max_cards_per_round || await getSetting('max_cards_per_round') || 10000;

    // Buscar último número de rodada
    const lastRoundResult = await client.query(
      'SELECT number FROM rounds ORDER BY number DESC LIMIT 1'
    );

    const nextNumber = lastRoundResult.rows.length > 0
      ? lastRoundResult.rows[0].number + 1
      : 1;

    // Calcular horários
    const now = new Date();
    const startsAt = now; // ✅ CORRIGIDO: Começa AGORA (não em 1 minuto)
    const sellingEndsAt = addMinutes(startsAt, config.selling_minutes); // Venda termina em 7 min
    const endsAt = addMinutes(sellingEndsAt, config.closed_minutes); // Rodada fecha completamente em +3 min

    // Criar rodada
    const result = await client.query(
      `INSERT INTO rounds (number, type, status, card_price, max_cards, starts_at, selling_ends_at, ends_at, is_selling)
       VALUES ($1, $2, 'selling', $3, $4, $5, $6, $7, true)
       RETURNING *`,
      [nextNumber, type, cardPrice, maxCards, startsAt, sellingEndsAt, endsAt]
    );

    await client.query('COMMIT');

    const round = result.rows[0];

    console.log(`✓ Round #${round.number} created (${type}) - Status: SELLING - Selling: ${config.selling_minutes}min, Closed: ${config.closed_minutes}min`);

    // Publicar no Redis
    await redis.publish('rounds:new', JSON.stringify(round));

    return round;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating round:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Inicia venda de uma rodada
 * @param {number} roundId - ID da rodada
 * @returns {Promise<boolean>} Sucesso
 */
export async function startRoundSelling(roundId) {
  try {
    await db.query(
      `UPDATE rounds SET status = 'selling', is_selling = true WHERE id = $1 AND status = 'scheduled'`,
      [roundId]
    );

    console.log(`✓ Round #${roundId} selling started`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:status`, JSON.stringify({
      status: 'selling',
      is_selling: true,
      timestamp: new Date()
    }));

    return true;
  } catch (error) {
    console.error('Error starting round selling:', error);
    return false;
  }
}

/**
 * Fecha venda de uma rodada (período de 3 minutos antes do sorteio)
 * @param {number} roundId - ID da rodada
 * @returns {Promise<boolean>} Sucesso
 */
export async function closeRoundSelling(roundId) {
  try {
    await db.query(
      `UPDATE rounds SET is_selling = false WHERE id = $1 AND status = 'selling' AND is_selling = true`,
      [roundId]
    );

    console.log(`✓ Round #${roundId} selling closed (waiting period)`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:status`, JSON.stringify({
      status: 'selling',
      is_selling: false,
      timestamp: new Date()
    }));

    return true;
  } catch (error) {
    console.error('Error closing round selling:', error);
    return false;
  }
}

/**
 * Inicia sorteio de uma rodada
 * @param {number} roundId - ID da rodada
 * @returns {Promise<boolean>} Sucesso
 */
export async function startRoundDrawing(roundId) {
  try {
    await db.query(
      `UPDATE rounds
       SET status = 'drawing', drawing_started_at = NOW()
       WHERE id = $1 AND status = 'selling'`,
      [roundId]
    );

    console.log(`✓ Round #${roundId} drawing started`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:status`, JSON.stringify({
      status: 'drawing',
      timestamp: new Date()
    }));

    return true;
  } catch (error) {
    console.error('Error starting round drawing:', error);
    return false;
  }
}

/**
 * Sorteia próximo número
 * @param {number} roundId - ID da rodada
 * @returns {Promise<Object>} Número sorteado
 */
export async function drawNextNumber(roundId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Buscar rodada
    const roundResult = await client.query(
      'SELECT * FROM rounds WHERE id = $1 AND status = $2',
      [roundId, 'drawing']
    );

    if (roundResult.rows.length === 0) {
      throw new Error('Round not found or not in drawing status');
    }

    const round = roundResult.rows[0];
    const drawnNumbers = round.drawn_numbers || [];

    // Verificar se já sorteou todos
    if (drawnNumbers.length >= 75) {
      throw new Error('All numbers already drawn');
    }

    // Sortear número que ainda não foi sorteado
    let number;
    do {
      number = Math.floor(Math.random() * 75) + 1;
    } while (drawnNumbers.includes(number));

    const position = drawnNumbers.length + 1;

    // Registrar sorteio
    await client.query(
      `INSERT INTO draws (round_id, number, position)
       VALUES ($1, $2, $3)`,
      [roundId, number, position]
    );

    // Atualizar rodada
    drawnNumbers.push(number);
    await client.query(
      `UPDATE rounds SET drawn_numbers = $1 WHERE id = $2`,
      [drawnNumbers, roundId]
    );

    await client.query('COMMIT');

    const result = { number, position, total: drawnNumbers.length };

    console.log(`✓ Round #${roundId} drew number: ${number} (${position}/75)`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:numbers`, JSON.stringify(result));

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error drawing number:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Finaliza rodada
 * @param {number} roundId - ID da rodada
 * @returns {Promise<boolean>} Sucesso
 */
export async function finishRound(roundId) {
  try {
    await db.query(
      `UPDATE rounds
       SET status = 'finished', finished_at = NOW()
       WHERE id = $1 AND status IN ('drawing', 'selling')`,
      [roundId]
    );

    console.log(`✓ Round #${roundId} finished`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:status`, JSON.stringify({
      status: 'finished',
      timestamp: new Date()
    }));

    return true;
  } catch (error) {
    console.error('Error finishing round:', error);
    return false;
  }
}

/**
 * Cancela rodada
 * @param {number} roundId - ID da rodada
 * @returns {Promise<boolean>} Sucesso
 */
export async function cancelRound(roundId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Atualizar status da rodada
    await client.query(
      `UPDATE rounds SET status = 'cancelled' WHERE id = $1`,
      [roundId]
    );

    // Reembolsar compras (marcar como refunded)
    await client.query(
      `UPDATE purchases
       SET payment_status = 'refunded'
       WHERE round_id = $1 AND payment_status = 'paid'`,
      [roundId]
    );

    await client.query('COMMIT');

    console.log(`✓ Round #${roundId} cancelled`);

    // Publicar no Redis
    await redis.publish(`round:${roundId}:status`, JSON.stringify({
      status: 'cancelled',
      timestamp: new Date()
    }));

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling round:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Verifica se precisa criar nova rodada
 * @returns {Promise<void>}
 */
export async function checkAndCreateRounds() {
  try {
    const now = new Date();

    // Verificar rodadas regulares
    const nextRegular = await db.query(
      `SELECT * FROM rounds
       WHERE type = 'regular' AND status = 'scheduled'
       ORDER BY starts_at ASC
       LIMIT 1`
    );

    if (nextRegular.rows.length === 0 || new Date(nextRegular.rows[0].starts_at) < addMinutes(now, 5)) {
      await createNextRound('regular');
    }

    // Verificar rodadas especiais
    const nextSpecial = await db.query(
      `SELECT * FROM rounds
       WHERE type = 'special' AND status = 'scheduled'
       ORDER BY starts_at ASC
       LIMIT 1`
    );

    if (nextSpecial.rows.length === 0 || new Date(nextSpecial.rows[0].starts_at) < addMinutes(now, 30)) {
      await createNextRound('special');
    }
  } catch (error) {
    console.error('Error checking rounds:', error);
  }
}

/**
 * Atualiza status das rodadas baseado no horário
 * @returns {Promise<void>}
 */
export async function updateRoundsStatus() {
  try {
    const now = new Date();

    // Iniciar venda das rodadas agendadas
    const startedRounds = await db.query(
      `UPDATE rounds
       SET status = 'selling', is_selling = true
       WHERE status = 'scheduled' AND starts_at <= $1
       RETURNING id, number`,
      [now]
    );

    for (const round of startedRounds.rows) {
      console.log(`✓ Round #${round.number} selling started (auto)`);
      await redis.publish(`round:${round.id}:status`, JSON.stringify({
        status: 'selling',
        is_selling: true,
        timestamp: new Date()
      }));
    }

    // Fechar venda das rodadas que atingiram selling_ends_at
    const closedSellingRounds = await db.query(
      `UPDATE rounds
       SET is_selling = false
       WHERE status = 'selling' AND is_selling = true AND selling_ends_at <= $1
       RETURNING id, number`,
      [now]
    );

    for (const round of closedSellingRounds.rows) {
      console.log(`✓ Round #${round.number} selling closed (auto) - waiting period`);
      await redis.publish(`round:${round.id}:status`, JSON.stringify({
        status: 'selling',
        is_selling: false,
        timestamp: new Date()
      }));
    }

    // Iniciar sorteio das rodadas que passaram do horário final (ends_at)
    const drawingRounds = await db.query(
      `UPDATE rounds
       SET status = 'drawing', drawing_started_at = NOW()
       WHERE status = 'selling' AND ends_at <= $1
       RETURNING id, number`,
      [now]
    );

    for (const round of drawingRounds.rows) {
      console.log(`✓ Round #${round.number} drawing started (auto)`);
      await redis.publish(`round:${round.id}:status`, JSON.stringify({
        status: 'drawing',
        timestamp: new Date()
      }));
    }

  } catch (error) {
    console.error('Error updating rounds status:', error);
  }
}
