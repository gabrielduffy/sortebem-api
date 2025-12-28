import cron from 'node-cron';
import { db } from '../config/database.js';
import {
  checkAndCreateRounds,
  updateRoundsStatus,
  drawNextNumber
} from '../services/roundManager.js';
import { generateCards } from '../services/cardGenerator.js';
import { sendCardsViaWhatsApp } from '../services/whatsappService.js';

/* =========================
   CRON JOBS
========================= */

/**
 * Inicializa todos os cron jobs
 */
export function startCronJobs() {
  console.log('🕐 Starting cron jobs...');

  // A cada minuto: verificar e criar novas rodadas
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndCreateRounds();
      await updateRoundsStatus();
    } catch (error) {
      console.error('Error in round check job:', error);
    }
  });

  // A cada minuto: verificar compras PIX expiradas
  cron.schedule('* * * * *', async () => {
    try {
      await checkExpiredPurchases();
    } catch (error) {
      console.error('Error in expired purchases job:', error);
    }
  });

  // A cada 10 segundos: sortear próximo número automaticamente (se houver rodada em sorteio)
  cron.schedule('*/10 * * * * *', async () => {
    try {
      await autoDrawNumbers();
    } catch (error) {
      console.error('Error in auto draw job:', error);
    }
  });

  // A cada 5 minutos: processar comissões pendentes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processCommissions();
    } catch (error) {
      console.error('Error in commissions job:', error);
    }
  });

  // A cada hora: limpar dados antigos
  cron.schedule('0 * * * *', async () => {
    try {
      await cleanupOldData();
    } catch (error) {
      console.error('Error in cleanup job:', error);
    }
  });

  console.log('✓ Cron jobs started');
}

/* =========================
   JOB FUNCTIONS
========================= */

/**
 * Verifica e marca compras PIX expiradas
 */
async function checkExpiredPurchases() {
  const result = await db.query(
    `UPDATE purchases
     SET payment_status = 'expired'
     WHERE payment_status = 'pending'
       AND payment_method = 'pix'
       AND pix_expiration < NOW()
     RETURNING id`
  );

  if (result.rows.length > 0) {
    console.log(`✓ Expired ${result.rows.length} purchases`);
  }
}

/**
 * Sorteia números automaticamente em rodadas ativas
 */
async function autoDrawNumbers() {
  // Buscar rodadas em sorteio
  const result = await db.query(
    `SELECT id, drawn_numbers
     FROM rounds
     WHERE status = 'drawing'
       AND (drawn_numbers IS NULL OR array_length(drawn_numbers, 1) < 75)`
  );

  for (const round of result.rows) {
    try {
      // Sortear próximo número
      await drawNextNumber(round.id);

      // Verificar se completou 75 números
      if ((round.drawn_numbers?.length || 0) >= 74) {
        // Finalizar rodada se não houver vencedor após 75 números
        await db.query(
          `UPDATE rounds SET status = 'finished', finished_at = NOW() WHERE id = $1`,
          [round.id]
        );
        console.log(`✓ Round #${round.id} auto-finished (no winner)`);
      }
    } catch (error) {
      console.error(`Error drawing number for round ${round.id}:`, error);
    }
  }
}

/**
 * Processa comissões pendentes de compras pagas
 */
async function processCommissions() {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Buscar compras pagas sem comissões geradas
    const purchases = await client.query(
      `SELECT p.*, e.id as establishment_id, e.manager_id, e.commission_rate as est_rate, m.commission_rate as mgr_rate
       FROM purchases p
       LEFT JOIN establishments e ON p.establishment_id = e.id
       LEFT JOIN managers m ON e.manager_id = m.id
       WHERE p.payment_status = 'paid'
         AND p.id NOT IN (SELECT DISTINCT purchase_id FROM commissions WHERE purchase_id IS NOT NULL)`
    );

    for (const purchase of purchases.rows) {
      // Comissão do estabelecimento
      if (purchase.establishment_id) {
        const estAmount = purchase.total_amount * (purchase.est_rate / 100);

        await client.query(
          `INSERT INTO commissions (purchase_id, establishment_id, type, amount)
           VALUES ($1, $2, 'establishment', $3)`,
          [purchase.id, purchase.establishment_id, estAmount]
        );

        // Atualizar total do estabelecimento
        await client.query(
          `UPDATE establishments
           SET total_commission = total_commission + $1
           WHERE id = $2`,
          [estAmount, purchase.establishment_id]
        );
      }

      // Comissão do gerente
      if (purchase.manager_id) {
        const mgrAmount = purchase.total_amount * (purchase.mgr_rate / 100);

        await client.query(
          `INSERT INTO commissions (purchase_id, manager_id, type, amount)
           VALUES ($1, $2, 'manager', $3)`,
          [purchase.id, purchase.manager_id, mgrAmount]
        );

        // Atualizar total do gerente
        await client.query(
          `UPDATE managers
           SET total_commission = total_commission + $1
           WHERE id = $2`,
          [mgrAmount, purchase.manager_id]
        );
      }
    }

    await client.query('COMMIT');

    if (purchases.rows.length > 0) {
      console.log(`✓ Processed commissions for ${purchases.rows.length} purchases`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing commissions:', error);
  } finally {
    client.release();
  }
}

/**
 * Processa compras pagas que ainda não geraram cartelas
 */
export async function processPaidPurchases() {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Buscar compras pagas sem cartelas
    const purchases = await client.query(
      `SELECT p.*
       FROM purchases p
       WHERE p.payment_status = 'paid'
         AND p.id NOT IN (SELECT DISTINCT purchase_id FROM cards WHERE purchase_id IS NOT NULL)`
    );

    for (const purchase of purchases.rows) {
      // Gerar cartelas
      const cards = await generateCards(purchase.round_id, purchase.id, purchase.quantity);

      // Atualizar rodada
      await client.query(
        `UPDATE rounds
         SET cards_sold = cards_sold + $1,
             prize_pool = prize_pool + $2,
             charity_amount = charity_amount + $3,
             platform_amount = platform_amount + $4,
             commission_amount = commission_amount + $5
         WHERE id = $6`,
        [
          purchase.quantity,
          purchase.total_amount * 0.4,
          purchase.total_amount * 0.2,
          purchase.total_amount * 0.3,
          purchase.total_amount * 0.1,
          purchase.round_id
        ]
      );

      // Enviar cartelas por WhatsApp se houver número
      if (purchase.customer_whatsapp) {
        const roundResult = await client.query('SELECT * FROM rounds WHERE id = $1', [purchase.round_id]);
        const round = roundResult.rows[0];

        const cardCodes = cards.map(c => c.code);

        await sendCardsViaWhatsApp(purchase.customer_whatsapp, cardCodes, round);
      }

      console.log(`✓ Generated ${cards.length} cards for purchase #${purchase.id}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing paid purchases:', error);
  } finally {
    client.release();
  }
}

/**
 * Limpa dados antigos do sistema
 */
async function cleanupOldData() {
  try {
    // Limpar logs de WhatsApp com mais de 30 dias
    await db.query(
      `DELETE FROM whatsapp_logs WHERE created_at < NOW() - INTERVAL '30 days'`
    );

    // Limpar compras canceladas/expiradas antigas
    await db.query(
      `DELETE FROM purchases
       WHERE payment_status IN ('cancelled', 'expired')
         AND created_at < NOW() - INTERVAL '7 days'`
    );

    console.log('✓ Cleanup completed');
  } catch (error) {
    console.error('Error in cleanup:', error);
  }
}

// Adicionar job de processamento de compras pagas ao cron
cron.schedule('*/30 * * * * *', async () => {
  try {
    await processPaidPurchases();
  } catch (error) {
    console.error('Error in paid purchases job:', error);
  }
});
