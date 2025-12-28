import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) throw new Error('JWT_SECRET missing');

/* =========================
   AUTH MIDDLEWARE - Verificar JWT
========================= */
export async function authRequired(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        ok: false,
        error: 'Token não fornecido'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    // Buscar usuário no banco
    const result = await db.query(
      'SELECT id, name, email, whatsapp, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({
        ok: false,
        error: 'Usuário não encontrado'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return reply.status(403).send({
        ok: false,
        error: 'Usuário inativo'
      });
    }

    // Adicionar usuário ao request
    request.user = user;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({
        ok: false,
        error: 'Token inválido'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        ok: false,
        error: 'Token expirado'
      });
    }
    return reply.status(500).send({
      ok: false,
      error: 'Erro ao verificar autenticação'
    });
  }
}

/* =========================
   ADMIN ONLY
========================= */
export async function authAdmin(request, reply) {
  await authRequired(request, reply);

  if (reply.sent) return;

  if (request.user.role !== 'admin') {
    return reply.status(403).send({
      ok: false,
      error: 'Acesso restrito a administradores'
    });
  }
}

/* =========================
   MANAGER OR ADMIN
========================= */
export async function authManager(request, reply) {
  await authRequired(request, reply);

  if (reply.sent) return;

  if (!['admin', 'manager'].includes(request.user.role)) {
    return reply.status(403).send({
      ok: false,
      error: 'Acesso restrito a gerentes ou administradores'
    });
  }
}

/* =========================
   ESTABLISHMENT OR ADMIN
========================= */
export async function authEstablishment(request, reply) {
  await authRequired(request, reply);

  if (reply.sent) return;

  if (!['admin', 'establishment'].includes(request.user.role)) {
    return reply.status(403).send({
      ok: false,
      error: 'Acesso restrito a estabelecimentos ou administradores'
    });
  }
}

/* =========================
   POS TERMINAL AUTH
========================= */
export async function authPOS(request, reply) {
  try {
    const terminalId = request.headers['x-terminal-id'];
    const apiKey = request.headers['x-api-key'];

    if (!terminalId || !apiKey) {
      return reply.status(401).send({
        ok: false,
        error: 'Credenciais POS não fornecidas'
      });
    }

    // Buscar terminal
    const result = await db.query(
      `SELECT pt.*, e.id as establishment_id, e.is_active as establishment_active
       FROM pos_terminals pt
       JOIN establishments e ON pt.establishment_id = e.id
       WHERE pt.terminal_id = $1 AND pt.is_active = true`,
      [terminalId]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({
        ok: false,
        error: 'Terminal não encontrado ou inativo'
      });
    }

    const terminal = result.rows[0];

    if (!terminal.establishment_active) {
      return reply.status(403).send({
        ok: false,
        error: 'Estabelecimento inativo'
      });
    }

    // Verificar API key (usando bcrypt para comparação segura)
    const bcrypt = await import('bcryptjs');
    const validKey = await bcrypt.compare(apiKey, terminal.api_key_hash);

    if (!validKey) {
      return reply.status(401).send({
        ok: false,
        error: 'API key inválida'
      });
    }

    // Atualizar heartbeat
    await db.query(
      'UPDATE pos_terminals SET last_heartbeat = NOW() WHERE id = $1',
      [terminal.id]
    );

    // Adicionar terminal ao request
    request.terminal = {
      id: terminal.id,
      terminal_id: terminal.terminal_id,
      establishment_id: terminal.establishment_id,
      name: terminal.name
    };
  } catch (error) {
    console.error('POS auth error:', error);
    return reply.status(500).send({
      ok: false,
      error: 'Erro ao verificar autenticação POS'
    });
  }
}

/* =========================
   GENERATE JWT TOKEN
========================= */
export function generateToken(userId, expiresIn = '7d') {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
}
