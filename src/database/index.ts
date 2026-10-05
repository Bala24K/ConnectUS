import { Pool, PoolConfig } from 'pg';
import { config } from '../config';
import { logger } from '../observability/logger';

let pool: Pool | null = null;
let isConnected = false;

export function getDatabasePool(): Pool | null {
  if (pool) return pool;

  if (!config.databaseUrl) {
    logger.info('No DATABASE_URL configured; running in memory storage fallback mode.');
    return null;
  }

  try {
    const poolConfig: PoolConfig = {
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
      isConnected = false;
    });

    return pool;
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize PostgreSQL pool; fallback to in-memory store.');
    return null;
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const p = getDatabasePool();
  if (!p) return false;

  try {
    const client = await p.connect();
    try {
      await client.query('SELECT 1');
      isConnected = true;
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    isConnected = false;
    return false;
  }
}

export function isDatabaseHealthy(): boolean {
  return isConnected;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
  }
}
