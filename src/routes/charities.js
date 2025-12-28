import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';

export default async function charitiesRoutes(fastify) {
  // GET /charities (admin only)
  fastify.get('/charities', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query('SELECT * FROM charities ORDER BY created_at DESC');
      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching charities:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar instituições'));
    }
  });

  // GET /charities/active (público)
  fastify.get('/charities/active', async (request, reply) => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const result = await db.query(
        `SELECT c.* FROM charities c
         JOIN charity_monthly cm ON c.id = cm.charity_id
         WHERE cm.month = $1 AND cm.year = $2`,
        [month, year]
      );

      return reply.send(successResponse(result.rows[0] || null));
    } catch (error) {
      console.error('Error fetching active charity:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar instituição ativa'));
    }
  });

  // POST /charities (admin only)
  fastify.post('/charities', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { name, description, logo_url, pix_key } = request.body;

      const result = await db.query(
        `INSERT INTO charities (name, description, logo_url, pix_key)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, description, logo_url, pix_key]
      );

      await logAudit({
        userId: request.user.id,
        action: 'create',
        entity: 'charity',
        entityId: result.rows[0].id,
        newData: result.rows[0],
        ipAddress: request.ip
      });

      return reply.status(201).send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error creating charity:', error);
      return reply.status(500).send(errorResponse('Erro ao criar instituição'));
    }
  });

  // PUT /charities/:id (admin only)
  fastify.put('/charities/:id', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, description, logo_url, pix_key, is_active } = request.body;

      const result = await db.query(
        `UPDATE charities
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             logo_url = COALESCE($3, logo_url),
             pix_key = COALESCE($4, pix_key),
             is_active = COALESCE($5, is_active)
         WHERE id = $6
         RETURNING *`,
        [name, description, logo_url, pix_key, is_active, id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Instituição não encontrada'));
      }

      await logAudit({
        userId: request.user.id,
        action: 'update',
        entity: 'charity',
        entityId: id,
        newData: result.rows[0],
        ipAddress: request.ip
      });

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error updating charity:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar instituição'));
    }
  });

  // POST /charities/:id/activate (admin only)
  fastify.post('/charities/:id/activate', { preHandler: authAdmin }, async (request, reply) => {
    const client = await db.connect();
    try {
      const { id } = request.params;
      const { month, year } = request.body;

      await client.query('BEGIN');

      // Criar registro de charity_monthly
      await client.query(
        `INSERT INTO charity_monthly (charity_id, month, year)
         VALUES ($1, $2, $3)
         ON CONFLICT (month, year) DO UPDATE
         SET charity_id = $1`,
        [id, month || new Date().getMonth() + 1, year || new Date().getFullYear()]
      );

      await client.query('COMMIT');

      return reply.send(successResponse({ message: 'Instituição ativada para o mês' }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error activating charity:', error);
      return reply.status(500).send(errorResponse('Erro ao ativar instituição'));
    } finally {
      client.release();
    }
  });
}
