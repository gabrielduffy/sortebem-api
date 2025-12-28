import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, logAudit, successResponse, errorResponse } from '../utils/helpers.js';

export default async function settingsRoutes(fastify) {
  // GET /settings (admin only)
  fastify.get('/settings', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query('SELECT key, value FROM settings ORDER BY key');

      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });

      return reply.send(successResponse(settings));
    } catch (error) {
      console.error('Error fetching settings:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar configurações'));
    }
  });

  // PUT /settings (admin only)
  fastify.put('/settings', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const updates = request.body;

      if (!updates || typeof updates !== 'object') {
        return reply.status(400).send(errorResponse('Dados inválidos'));
      }

      // Buscar valores antigos para auditoria
      const oldSettings = {};
      for (const key of Object.keys(updates)) {
        oldSettings[key] = await getSetting(key);
      }

      // Atualizar configurações
      for (const [key, value] of Object.entries(updates)) {
        await setSetting(key, value);
      }

      // Log de auditoria
      await logAudit({
        userId: request.user.id,
        action: 'update',
        entity: 'settings',
        oldData: oldSettings,
        newData: updates,
        ipAddress: request.ip
      });

      return reply.send(successResponse({ message: 'Configurações atualizadas com sucesso' }));
    } catch (error) {
      console.error('Error updating settings:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar configurações'));
    }
  });

  // GET /settings/public (público - apenas configurações públicas)
  fastify.get('/settings/public', async (request, reply) => {
    try {
      const publicKeys = [
        'card_price_regular',
        'card_price_special',
        'round_duration_regular',
        'round_duration_special',
        'winning_patterns'
      ];

      const result = await db.query(
        'SELECT key, value FROM settings WHERE key = ANY($1)',
        [publicKeys]
      );

      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });

      return reply.send(successResponse(settings));
    } catch (error) {
      console.error('Error fetching public settings:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar configurações'));
    }
  });
}
