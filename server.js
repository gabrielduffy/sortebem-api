import Fastify from "fastify";
import pg from "pg";
import Redis from "ioredis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = Fastify({ logger: true });
const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const BOOTSTRAP_KEY = process.env.BOOTSTRAP_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_NOW";

if (!DATABASE_URL) throw new Error("Missing env DATABASE_URL");
if (!REDIS_URL) throw new Error("Missing env REDIS_URL");

const db = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

async function ensureUsersTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function authAdmin(request, reply) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return reply.code(401).send({ ok: false, error: "missing_token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return reply.code(403).send({ ok: false, error: "admin_only" });
    }
    request.user = payload;
  } catch (e) {
    return reply.code(401).send({ ok: false, error: "invalid_token" });
  }
}

app.get("/", async () => {
  return { ok: true, service: "sortebem-api" };
});

app.get("/health", async () => {
  const r = await db.query("SELECT 1");
  const ping = await redis.ping();
  return {
    ok: true,
    postgres: r?.rowCount === 1,
    redis: ping === "PONG"
  };
});

/**
 * POST /bootstrap
 * Headers:
 *  x-bootstrap-key: <BOOTSTRAP_KEY>
 * Body:
 *  { name, email, password }
 *
 * Cria o primeiro admin (somente se não existir admin ainda).
 */
app.post("/bootstrap", async (request, reply) => {
  const key = request.headers["x-bootstrap-key"];
  if (!BOOTSTRAP_KEY) {
    return reply.code(500).send({ ok: false, error: "BOOTSTRAP_KEY_not_set" });
  }
  if (key !== BOOTSTRAP_KEY) {
    return reply.code(401).send({ ok: false, error: "invalid_bootstrap_key" });
  }

  const { name, email, password } = request.body || {};
  if (!name || !email || !password) {
    return reply.code(400).send({ ok: false, error: "missing_fields" });
  }

  await ensureUsersTable();

  const existingAdmin = await db.query(
    "SELECT id FROM users WHERE role='admin' LIMIT 1"
  );
  if (existingAdmin.rowCount > 0) {
    return reply.code(409).send({ ok: false, error: "admin_already_exists" });
  }

  const password_hash = await bcrypt.hash(String(password), 10);

  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, name, email, role, created_at`,
    [name, email.toLowerCase(), password_hash]
  );

  const user = result.rows[0];
  const token = signToken(user);

  return { ok: true, user, token };
});

/**
 * POST /auth/login
 * Body: { email, password }
 */
app.post("/auth/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ ok: false, error: "missing_fields" });
  }

  await ensureUsersTable();

  const res = await db.query(
    "SELECT id, name, email, role, password_hash, is_active FROM users WHERE email=$1 LIMIT 1",
    [String(email).toLowerCase()]
  );
  if (res.rowCount === 0) {
    return reply.code(401).send({ ok: false, error: "invalid_credentials" });
  }

  const user = res.rows[0];
  if (!user.is_active) {
    return reply.code(403).send({ ok: false, error: "user_inactive" });
  }

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    return reply.code(401).send({ ok: false, error: "invalid_credentials" });
  }

  const token = signToken(user);
  return {
    ok: true,
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  };
});

/**
 * POST /users  (admin)
 * Header: Authorization: Bearer <token>
 * Body: { name, email, password, role? }
 */
app.post("/users", { preHandler: authAdmin }, async (request, reply) => {
  const { name, email, password, role } = request.body || {};
  if (!name || !email || !password) {
    return reply.code(400).send({ ok: false, error: "missing_fields" });
  }

  const password_hash = await bcrypt.hash(String(password), 10);
  const userRole = role === "admin" ? "admin" : "user";

  try {
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, String(email).toLowerCase(), password_hash, userRole]
    );

    return { ok: true, user: result.rows[0] };
  } catch (e) {
    if (String(e?.message || "").includes("users_email_key")) {
      return reply.code(409).send({ ok: false, error: "email_already_exists" });
    }
    request.log.error(e);
    return reply.code(500).send({ ok: false, error: "failed_to_create_user" });
  }
});

app.listen({ port: PORT, host: "0.0.0.0" });
