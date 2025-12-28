import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

/* =========================
   ENV VARIABLES
========================= */
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL missing');
if (!REDIS_URL) throw new Error('REDIS_URL missing');

/* =========================
   DATABASE CONNECTION
========================= */
export const db = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

/* =========================
   REDIS CONNECTION
========================= */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

/* =========================
   CONNECTION TESTS
========================= */
db.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

/* =========================
   HELPER FUNCTIONS
========================= */
export async function testConnections() {
  try {
    // Test PostgreSQL
    await db.query('SELECT 1');
    console.log('✓ PostgreSQL connected');

    // Test Redis
    await redis.ping();
    console.log('✓ Redis connected');

    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

export async function closeConnections() {
  await db.end();
  await redis.quit();
  console.log('✓ Database connections closed');
}
