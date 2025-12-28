import { db } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { authRequired, authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';

export default async function usersRoutes(fastify) {
  // GET /users (admin only)
  fastify.get('/', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        'SELECT id, name, email, whatsapp, role, is_active, created_at FROM users ORDER BY created_at DESC'
      );

      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching users:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar usuários'));
    }
  });

  // GET /users/:id (admin only)
  fastify.get('/:id', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        'SELECT id, name, email, whatsapp, role, is_active, created_at FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Usuário não encontrado'));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching user:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar usuário'));
    }
  });

  // PUT /users/:id (admin only)
  fastify.put('/:id', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, email, whatsapp, role, is_active, password } = request.body;

      let query = `UPDATE users SET
                   name = COALESCE($1, name),
                   email = COALESCE($2, email),
                   whatsapp = COALESCE($3, whatsapp),
                   role = COALESCE($4, role),
                   is_active = COALESCE($5, is_active)`;
      const params = [name, email, whatsapp, role, is_active];

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        query += `, password_hash = $${params.length + 1}`;
        params.push(passwordHash);
      }

      query += ` WHERE id = $${params.length + 1} RETURNING id, name, email, whatsapp, role, is_active`;
      params.push(id);

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Usuário não encontrado'));
      }

      await logAudit({
        userId: request.user.id,
        action: 'update',
        entity: 'user',
        entityId: id,
        newData: request.body,
        ipAddress: request.ip
      });

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error updating user:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar usuário'));
    }
  });

  // DELETE /users/:id (admin only - soft delete)
  fastify.delete('/:id', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.query(
        'UPDATE users SET is_active = false WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Usuário não encontrado'));
      }

      await logAudit({
        userId: request.user.id,
        action: 'delete',
        entity: 'user',
        entityId: id,
        ipAddress: request.ip
      });

      return reply.send(successResponse({ message: 'Usuário desativado' }));
    } catch (error) {
      console.error('Error deleting user:', error);
      return reply.status(500).send(errorResponse('Erro ao desativar usuário'));
    }
  });

  // GET /me (usuário logado)
  fastify.get('/me', { preHandler: authRequired }, async (request, reply) => {
    try {
      return reply.send(successResponse(request.user));
    } catch (error) {
      console.error('Error fetching current user:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar usuário'));
    }
  });

  // PUT /me (atualizar próprio perfil)
  fastify.put('/me', { preHandler: authRequired }, async (request, reply) => {
    try {
      const { name, email, whatsapp, password } = request.body;

      let query = `UPDATE users SET
                   name = COALESCE($1, name),
                   email = COALESCE($2, email),
                   whatsapp = COALESCE($3, whatsapp)`;
      const params = [name, email, whatsapp];

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        query += `, password_hash = $${params.length + 1}`;
        params.push(passwordHash);
      }

      query += ` WHERE id = $${params.length + 1} RETURNING id, name, email, whatsapp, role, is_active`;
      params.push(request.user.id);

      const result = await db.query(query, params);

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error updating profile:', error);
      return reply.status(500).send(errorResponse('Erro ao atualizar perfil'));
    }
  });
}
