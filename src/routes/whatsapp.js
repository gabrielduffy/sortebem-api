import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { testWhatsAppConfig } from '../services/whatsappService.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

export default async function whatsappRoutes(fastify) {
  // GET /whatsapp/config (admin only)
  fastify.get('/whatsapp/config', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query('SELECT * FROM whatsapp_config WHERE id = 1');
      return reply.send(successResponse(result.rows[0] || null));
    } catch (error) {
      console.error('Error fetching WhatsApp config:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar configuração'));
    }
  });

  // PUT /whatsapp/config (admin only)
  fastify.put('/whatsapp/config', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { api_url, api_key, sender_number, message_template, is_active } = request.body;

      const result = await db.query(
        `INSERT INTO whatsapp_config (id, api_url, api_key, sender_number, message_template, is_active, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE
         SET api_url = $1, api_key = $2, sender_number = $3, message_template = $4, is_active = $5, updated_at = NOW()
         RETURNING *`,
        [api_url, api_key, sender_number, message_template, is_active]
      );

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error updating WhatsApp config:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar configuração'));
    }
  });

  // POST /whatsapp/test (admin only)
  fastify.post('/whatsapp/test', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { phone } = request.body;

      const result = await testWhatsAppConfig(phone);

      if (!result.success) {
        return reply.status(400).send(errorResponse(result.error));
      }

      return reply.send(successResponse({ message: 'Mensagem de teste enviada com sucesso' }));
    } catch (error) {
      console.error('Error testing WhatsApp:', error);
      return reply.status(500).send(errorResponse('Erro ao testar WhatsApp'));
    }
  });

  // GET /whatsapp/logs (admin only)
  fastify.get('/whatsapp/logs', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        'SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT 100'
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching WhatsApp logs:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar logs'));
    }
  });
}
