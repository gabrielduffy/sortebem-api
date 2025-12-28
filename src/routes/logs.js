import { db } from '../config/database.js';
import { authAdmin } from '../middleware/auth.js';
import { successResponse, errorResponse, createPaginationMeta, calculateOffset } from '../utils/helpers.js';

export default async function logsRoutes(fastify) {
  // GET /logs (admin only)
  fastify.get('/', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const { page = 1, limit = 50, entity, action, user_id } = request.query;
      const offset = calculateOffset(page, limit);

      let query = `SELECT l.*, u.name as user_name FROM audit_logs l
                   LEFT JOIN users u ON l.user_id = u.id WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      if (entity) {
        query += ` AND l.entity = $${paramCount}`;
        params.push(entity);
        paramCount++;
      }

      if (action) {
        query += ` AND l.action = $${paramCount}`;
        params.push(action);
        paramCount++;
      }

      if (user_id) {
        query += ` AND l.user_id = $${paramCount}`;
        params.push(user_id);
        paramCount++;
      }

      query += ` ORDER BY l.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      return reply.send(successResponse({
        logs: result.rows,
        meta: createPaginationMeta(result.rows.length, page, limit)
      }));
    } catch (error) {
      console.error('Error fetching logs:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar logs'));
    }
  });
}
