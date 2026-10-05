import fs from 'fs';
import path from 'path';
import { getDatabasePool, checkDatabaseConnection } from './index';
import { logger } from '../observability/logger';

export async function runMigrations(): Promise<boolean> {
  const healthy = await checkDatabaseConnection();
  if (!healthy) {
    logger.info('Database not connected; skipping schema migration (using in-memory store).');
    return false;
  }

  const pool = getDatabasePool();
  if (!pool) return false;

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    logger.info('Executing database schema migrations...');
    await pool.query(sql);
    logger.info('Database schema migrations applied successfully.');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    return false;
  }
}

if (require.main === module) {
  runMigrations()
    .then((success) => process.exit(success ? 0 : 1))
    .catch(() => process.exit(1));
}
