import { db } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { authAdmin } from '../middleware/auth.js';
import { generateEstablishmentCode, generateSlug } from '../utils/codeGenerator.js';
import { successResponse, errorResponse, logAudit } from '../utils/helpers.js';

export default async function establishmentsRoutes(fastify) {
  // GET /establishments (admin only)
  fastify.get('/', { preHandler: authAdmin }, async (request, reply) => {
    try {
      const result = await db.query(
        `SELECT e.*,
                COALESCE(u.name, '') as name,
                COALESCE(u.email, '') as email,
                COALESCE(u.whatsapp, '') as whatsapp,
                m.code as manager_code
         FROM establishments e
         LEFT JOIN users u ON e.user_id = u.id
         LEFT JOIN managers m ON e.manager_id = m.id
         ORDER BY e.created_at DESC`
      );
      return reply.send(successResponse(result.rows));
    } catch (error) {
      console.error('Error fetching establishments:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estabelecimentos'));
    }
  });

  // POST /establishments (admin only)
  fastify.post('/', { preHandler: authAdmin }, async (request, reply) => {
    const client = await db.connect();
    try {
      const { name, email, whatsapp, password, establishment_name, cnpj, phone, address, city, state, manager_id } = request.body;

      await client.query('BEGIN');

      // Criar usuário
      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        `INSERT INTO users (name, email, whatsapp, password_hash, role)
         VALUES ($1, $2, $3, $4, 'establishment')
         RETURNING *`,
        [name, email, whatsapp, passwordHash]
      );

      const user = userResult.rows[0];

      // Gerar código e slug únicos
      let code, slug;
      let codeExists = true;
      while (codeExists) {
        code = generateEstablishmentCode();
        const check = await client.query('SELECT id FROM establishments WHERE code = $1', [code]);
        codeExists = check.rows.length > 0;
      }

      let slugExists = true, slugCounter = 0;
      slug = generateSlug(establishment_name);
      while (slugExists) {
        const check = await client.query('SELECT id FROM establishments WHERE slug = $1', [slug]);
        slugExists = check.rows.length > 0;
        if (slugExists) {
          slugCounter++;
          slug = `${generateSlug(establishment_name)}-${slugCounter}`;
        }
      }

      // Criar estabelecimento
      const estResult = await client.query(
        `INSERT INTO establishments (user_id, manager_id, name, cnpj, phone, address, city, state, code, slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [user.id, manager_id, establishment_name, cnpj, phone, address, city, state, code, slug]
      );

      await client.query('COMMIT');

      return reply.status(201).send(successResponse({ ...estResult.rows[0], user }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating establishment:', error);
      return reply.status(500).send(errorResponse('Erro ao criar estabelecimento'));
    } finally {
      client.release();
    }
  });

  // GET /establishments/by-slug/:slug (público - para modo TV)
  fastify.get('/by-slug/:slug', async (request, reply) => {
    try {
      const { slug } = request.params;

      const result = await db.query(
        `SELECT id, name, slug, city, state FROM establishments WHERE slug = $1 AND is_active = true`,
        [slug]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(errorResponse('Estabelecimento não encontrado'));
      }

      return reply.send(successResponse(result.rows[0]));
    } catch (error) {
      console.error('Error fetching establishment by slug:', error);
      return reply.status(500).send(errorResponse('Erro ao buscar estabelecimento'));
    }
  });
}
