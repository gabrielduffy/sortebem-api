import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, redis, testConnections } from './src/config/database.js';
import { startCronJobs } from './src/cron/jobs.js';
import { runSeedIfDev } from './src/database/seed.js';

// Importar rotas
import settingsRoutes from './src/routes/settings.js';
import charitiesRoutes from './src/routes/charities.js';
import managersRoutes from './src/routes/managers.js';
import establishmentsRoutes from './src/routes/establishments.js';
import posRoutes from './src/routes/pos.js';
import roundsRoutes from './src/routes/rounds.js';
import cardsRoutes from './src/routes/cards.js';
import purchasesRoutes from './src/routes/purchases.js';
import prizesRoutes from './src/routes/prizes.js';
import withdrawalsRoutes from './src/routes/withdrawals.js';
import whatsappRoutes from './src/routes/whatsapp.js';
import statsRoutes from './src/routes/stats.js';
import logsRoutes from './src/routes/logs.js';
import usersRoutes from './src/routes/users.js';

const app = Fastify({ logger: true });

/* =========================
   ENV
========================= */
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const BOOTSTRAP_KEY = process.env.BOOTSTRAP_KEY;

if (!JWT_SECRET) throw new Error('JWT_SECRET missing');
if (!BOOTSTRAP_KEY) throw new Error('BOOTSTRAP_KEY missing');

/* =========================
   CORS
========================= */
await app.register(cors, {
  origin: ['https://sortebem.com.br', 'http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-bootstrap-key', 'x-terminal-id', 'x-api-key']
});

/* =========================
   HELPERS
========================= */
async function ensureUsersTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      whatsapp TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function authAdmin(request, reply) {
  const auth = request.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return reply.code(401).send({ error: 'no_token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return reply.code(403).send({ error: 'admin_only' });
    }
    request.user = payload;
  } catch {
    return reply.code(401).send({ error: 'invalid_token' });
  }
}

/* =========================
   ROTAS BÁSICAS
========================= */
app.get('/', async () => {
  return { ok: true, api: 'SORTEBEM API v2.0', status: 'running' };
});

app.get('/health', async () => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    return { ok: true, postgres: true, redis: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

/* =========================
   BOOTSTRAP (CRIA ADMIN)
========================= */
app.post('/bootstrap', async (request, reply) => {
  const key = request.headers['x-bootstrap-key'];
  if (key !== BOOTSTRAP_KEY) {
    return reply.code(401).send({ error: 'invalid_bootstrap_key' });
  }

  const { name, email, password } = request.body || {};
  if (!name || !email || !password) {
    return reply.code(400).send({ error: 'missing_fields' });
  }

  await ensureUsersTable();

  const exists = await db.query(
    "SELECT id FROM users WHERE role='admin' LIMIT 1"
  );
  if (exists.rowCount > 0) {
    return reply.code(409).send({ error: 'admin_already_exists' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, name, email, role`,
    [name, email.toLowerCase(), password_hash]
  );

  const user = result.rows[0];
  const token = signToken(user);

  return { ok: true, user, token };
});

/* =========================
   LOGIN EMAIL
========================= */
app.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ error: 'missing_fields' });
  }

  const res = await db.query(
    'SELECT * FROM users WHERE email=$1 AND is_active=true LIMIT 1',
    [email.toLowerCase()]
  );
  if (res.rowCount === 0) {
    return reply.code(401).send({ error: 'invalid_credentials' });
  }

  const user = res.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return reply.code(401).send({ error: 'invalid_credentials' });
  }

  return {
    ok: true,
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  };
});

/* =========================
   LOGIN WHATSAPP
========================= */
app.post('/auth/login-whatsapp', async (request, reply) => {
  const { whatsapp, password } = request.body || {};
  if (!whatsapp || !password) {
    return reply.code(400).send({ error: 'missing_fields' });
  }

  const res = await db.query(
    'SELECT * FROM users WHERE whatsapp=$1 AND is_active=true LIMIT 1',
    [whatsapp]
  );
  if (res.rowCount === 0) {
    return reply.code(401).send({ error: 'invalid_credentials' });
  }

  const user = res.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return reply.code(401).send({ error: 'invalid_credentials' });
  }

  return {
    ok: true,
    token: signToken(user),
    user: { id: user.id, name: user.name, whatsapp: user.whatsapp, role: user.role }
  };
});

/* =========================
   CRIAR USUÁRIO (ADMIN) - Mantido para compatibilidade
========================= */
app.post('/users', { preHandler: authAdmin }, async (request, reply) => {
  const { name, email, whatsapp, password, role } = request.body || {};
  if (!name || !password) {
    return reply.code(400).send({ error: 'missing_fields' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const result = await db.query(
    `INSERT INTO users (name, email, whatsapp, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, whatsapp, role`,
    [
      name,
      email ? email.toLowerCase() : null,
      whatsapp || null,
      password_hash,
      role || 'user'
    ]
  );

  return { ok: true, user: result.rows[0] };
});

/* =========================
   REGISTRAR ROTAS
========================= */
await app.register(settingsRoutes, { prefix: '/settings' });
await app.register(charitiesRoutes, { prefix: '/charities' });
await app.register(managersRoutes, { prefix: '/managers' });
await app.register(establishmentsRoutes, { prefix: '/establishments' });
await app.register(posRoutes, { prefix: '/pos' });
await app.register(roundsRoutes, { prefix: '/rounds' });
await app.register(cardsRoutes, { prefix: '/cards' });
await app.register(purchasesRoutes, { prefix: '/purchases' });
await app.register(prizesRoutes, { prefix: '/prizes' });
await app.register(withdrawalsRoutes, { prefix: '/withdrawals' });
await app.register(whatsappRoutes, { prefix: '/whatsapp' });
await app.register(statsRoutes, { prefix: '/stats' });
await app.register(logsRoutes, { prefix: '/logs' });
await app.register(usersRoutes, { prefix: '/users' });

/* =========================
   WEBHOOK PIX (Simulado)
========================= */
app.post('/webhooks/pix', async (request, reply) => {
  try {
    const { transaction_id, status, purchase_id } = request.body;

    if (status === 'paid' || status === 'approved') {
      await db.query(
        `UPDATE purchases
         SET payment_status = 'paid', paid_at = NOW()
         WHERE id = $1 AND payment_status = 'pending'`,
        [purchase_id]
      );
    }

    return { ok: true };
  } catch (error) {
    console.error('Error processing PIX webhook:', error);
    return reply.status(500).send({ ok: false, error: error.message });
  }
});

/* =========================
   INICIALIZAÇÃO
========================= */
async function start() {
  try {
    // Testar conexões
    console.log('🔌 Testing database connections...');
    await testConnections();

    // Garantir tabela de usuários
    await ensureUsersTable();

    // Executar seed em desenvolvimento
    await runSeedIfDev();

    // Iniciar cron jobs
    startCronJobs();

    // Iniciar servidor
    await app.listen({ port: PORT, host: '0.0.0.0' });

    console.log(`🚀 SORTEBEM API running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
}

start();
