import Fastify from "fastify";
import pg from "pg";
import Redis from "ioredis";

const app = Fastify({ logger: true });
const { Pool } = pg;

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const redis = new Redis(process.env.REDIS_URL);

app.get("/health", async () => {
  const r = await db.query("SELECT 1");
  const ping = await redis.ping();
  return {
    ok: true,
    postgres: r.rowCount === 1,
    redis: ping === "PONG"
  };
});

app.listen({
  port: Number(process.env.PORT || 3000),
  host: "0.0.0.0"
});
