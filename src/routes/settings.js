import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { getSetting, setSetting, logAudit, successResponse, errorResponse } from '../utils/helpers.js';
import { testAsaasConfig } from '../services/asaasService.js';
import { testPagSeguroConfig } from '../services/pagseguroService.js';

export default async function settingsRoutes(fastify) {
  // GET / (admin only)
  fastify.get('/', { preHandler: authAdmin }, async (request, reply) => {
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

  // PUT / (admin only)
  fastify.put('/', { preHandler: authAdmin }, async (request, reply) => {
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

  // GET /public (público - apenas configurações públicas)
  fastify.get('/public', async (request, reply) => {
    try {
      const publicKeys = [
        'card_price_regular',
        'card_price_special',
        'round_duration_regular',
        'round_duration_special',
        'winning_patterns',
        'card_appearance',
        'platform_name'
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

  // GET /:key (admin only)
  fastify.get('/:key', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;

      const result = await db.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Configuração não encontrada'));
      }

      return reply.send(successResponse(result.rows[0].value));
    } catch (error) {
      console.error('Error fetching setting:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar configuração'));
    }
  });

  // PUT /:key (admin only)
  fastify.put('/:key', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { value } = request.body;

      const oldValue = await getSetting(key);

      await setSetting(key, value);

      // Log de auditoria
      await logAudit({
        userId: request.user.id,
        action: 'update',
        entity: 'settings',
        entityId: key,
        oldData: { [key]: oldValue },
        newData: { [key]: value },
        ipAddress: request.ip
      });

      return reply.send(successResponse({ key, value }));
    } catch (error) {
      console.error('Error updating setting:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar configuração'));
    }
  });

  // POST /gateway/test (admin only)
  fastify.post('/gateway/test', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { gateway } = request.body;

      let testResult;

      if (gateway === 'asaas') {
        testResult = await testAsaasConfig();
      } else if (gateway === 'pagseguro') {
        testResult = await testPagSeguroConfig();
      } else {
        return reply.status(400).send(errorResponse('Gateway inválido'));
      }

      if (!testResult) {
        return reply.status(400).send(errorResponse('Falha ao testar gateway. Verifique as configurações.'));
      }

      return reply.send(successResponse({ message: 'Gateway testado com sucesso', gateway }));
    } catch (error) {
      console.error('Error testing gateway:', error);
      return reply.status(500).send(errorResponse('Erro ao testar gateway: ' + error.message));
    }
  });
}
