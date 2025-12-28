import { db } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { authAdmin } from '../middleware/auth.js';
import { generateManagerCode } from '../utils/codeGenerator.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';

export default async function managersRoutes(fastify) {
  // GET /managers (admin only)
  fastify.get('/', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT m.*,
                COALESCE(u.name, '') as name,
                COALESCE(u.email, '') as email,
                COALESCE(u.whatsapp, '') as whatsapp,
                u.is_active as user_active
         FROM managers m
         LEFT JOIN users u ON m.user_id = u.id
         ORDER BY m.created_at DESC`
      );
      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching managers:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar gerentes'));
    }
  });

  // GET /managers/:id (admin only)
  fastify.get('/:id', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const result = await db.query(
        `SELECT m.*,
                COALESCE(u.name, '') as name,
                COALESCE(u.email, '') as email,
                COALESCE(u.whatsapp, '') as whatsapp
         FROM managers m
         LEFT JOIN users u ON m.user_id = u.id
         WHERE m.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Gerente não encontrado'));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching manager:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar gerente'));
    }
  });

  // POST /managers (admin only)
  fastify.post('/', { preHandler: authAdmin }, async (request, reply) => {
    const client = await db.connect();
    try {
      const { name, email, whatsapp, password, cpf, commission_rate } = request.body;

      await client.query('BEGIN');

      // Criar usuário
      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        `INSERT INTO users (name, email, whatsapp, password_hash, role)
         VALUES ($1, $2, $3, $4, 'manager')
         RETURNING *`,
        [name, email, whatsapp, passwordHash]
      );

      const user = userResult.rows[0];

      // Gerar código único
      let code;
      let codeExists = true;
      while (codeExists) {
        code = generateManagerCode();
        const check = await client.query('SELECT id FROM managers WHERE code = $1', [code]);
        codeExists = check.rows.length > 0;
      }

      // Criar gerente
      const managerResult = await client.query(
        `INSERT INTO managers (user_id, code, cpf, commission_rate)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.id, code, cpf, commission_rate || 3.00]
      );

      await client.query('COMMIT');

      await logAudit({
        userId: request.user.id,
        action: 'create',
        entity: 'manager',
        entityId: managerResult.rows[0].id,
        newData: { ...managerResult.rows[0], user },
        ipAddress: request.ip
      });

      return reply.status(201).send(successResponse({ ...managerResult.rows[0], user }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating manager:', error);
      return reply.status(500).send(errorResponse('Erro ao criar gerente'));
    } finally {
      client.release();
    }
  });

  // GET /managers/:id/establishments (admin only)
  fastify.get('/:id/establishments', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        `SELECT e.*,
                COALESCE(u.name, '') as user_name,
                COALESCE(u.email, '') as email,
                COALESCE(u.whatsapp, '') as whatsapp
         FROM establishments e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.manager_id = $1
         ORDER BY e.created_at DESC`,
        [id]
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching manager establishments:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estabelecimentos'));
    }
  });

  // PUT /managers/:id/kyc (admin only)
  fastify.put('/:id/kyc', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { kyc_status } = request.body;

      const result = await db.query(
        `UPDATE managers SET kyc_status = $1 WHERE id = $2 RETURNING *`,
        [kyc_status, id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Gerente não encontrado'));
      }

      await logAudit({
        userId: request.user.id,
        action: 'kyc_update',
        entity: 'manager',
        entityId: id,
        newData: { kyc_status },
        ipAddress: request.ip
      });

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error updating KYC:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar KYC'));
    }
  });
}
