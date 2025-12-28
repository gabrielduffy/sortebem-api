import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import Redis from "ioredis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = Fastify({ logger: true });
const { Pool } = pg;

/* =========================
   ENV
========================= */
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const BOOTSTRAP_KEY = process.env.BOOTSTRAP_KEY;

if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
if (!REDIS_URL) throw new Error("REDIS_URL missing");
if (!JWT_SECRET) throw new Error("JWT_SECRET missing");
if (!BOOTSTRAP_KEY) throw new Error("BOOTSTRAP_KEY missing");

/* =========================
   DATABASE & REDIS
========================= */
const db = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL);

/* =========================
   CORS
========================= */
await app.register(cors, {
  origin: ["https://sortebem.com.br", "http://localhost:5173", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-bootstrap-key"]
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
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function authAdmin(request, reply) {
  const auth = request.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return reply.code(401).send({ error: "no_token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return reply.code(403).send({ error: "admin_only" });
    }
    request.user = payload;
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

/* =========================
   ROTAS BÁSICAS
========================= */
app.get("/", async () => {
  return { ok: true, api: "Sortebem API" };
});

app.get("/health", async () => {
  await db.query("SELECT 1");
  await redis.ping();
  return { ok: true, postgres: true, redis: true };
});

/* =========================
   BOOTSTRAP (CRIA ADMIN)
========================= */
app.post("/bootstrap", async (request, reply) => {
  const key = request.headers["x-bootstrap-key"];
  if (key !== BOOTSTRAP_KEY) {
    return reply.code(401).send({ error: "invalid_bootstrap_key" });
  }

  const { name, email, password } = request.body || {};
  if (!name || !email || !password) {
    return reply.code(400).send({ error: "missing_fields" });
  }

  await ensureUsersTable();

  const exists = await db.query(
    "SELECT id FROM users WHERE role='admin' LIMIT 1"
  );
  if (exists.rowCount > 0) {
    return reply.code(409).send({ error: "admin_already_exists" });
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
app.post("/auth/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ error: "missing_fields" });
  }

  const res = await db.query(
    "SELECT * FROM users WHERE email=$1 LIMIT 1",
    [email.toLowerCase()]
  );
  if (res.rowCount === 0) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  const user = res.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  return {
    ok: true,
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role }
  };
});

/* =========================
   LOGIN WHATSAPP
========================= */
app.post("/auth/login-whatsapp", async (request, reply) => {
  const { whatsapp, password } = request.body || {};
  if (!whatsapp || !password) {
    return reply.code(400).send({ error: "missing_fields" });
  }

  const res = await db.query(
    "SELECT * FROM users WHERE whatsapp=$1 LIMIT 1",
    [whatsapp]
  );
  if (res.rowCount === 0) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  const user = res.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  return {
    ok: true,
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role }
  };
});

/* =========================
   CRIAR USUÁRIO (ADMIN)
========================= */
app.post("/users", { preHandler: authAdmin }, async (request, reply) => {
  const { name, email, whatsapp, password, role } = request.body || {};
  if (!name || !password) {
    return reply.code(400).send({ error: "missing_fields" });
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
      role || "user"
    ]
  );

  return { ok: true, user: result.rows[0] };
});

/* =========================
   START
========================= */
app.listen({ port: PORT, host: "0.0.0.0" });
