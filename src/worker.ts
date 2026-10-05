import { ModerationWorker } from './jobs/moderation.worker';
import { initializeRepositories } from './repositories/factory';
import { logger } from './observability/logger';
import { closeDatabasePool } from './database';

async function startWorker() {
  logger.info('Starting Standalone Moderation Worker...');
  initializeRepositories();

  const worker = new ModerationWorker();
  worker.start();

  logger.info('Standalone Moderation Worker is active and listening for queue jobs.');

  const shutdown = async () => {
    logger.info('Stopping Moderation Worker...');
    await worker.stop();
    await closeDatabasePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startWorker().catch((err) => {
  logger.fatal({ err }, 'Worker process fatal crash');
  process.exit(1);
});
