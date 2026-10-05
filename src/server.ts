import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { config } from './config';
import { createApp } from './app';
import { initializeRepositories } from './repositories/factory';
import { runMigrations } from './database/migrate';
import { initializeSocketServer } from './socket';
import { ModerationWorker } from './jobs/moderation.worker';
import { logger } from './observability/logger';
import { closeDatabasePool } from './database';

async function bootstrap() {
  logger.info({ port: config.port, env: config.nodeEnv }, 'Starting ConnectUs Platform...');

  // 1. Initialize Repositories and Auto-Migrate DB if available
  initializeRepositories();
  try {
    await runMigrations();
  } catch (err) {
    logger.warn({ err }, 'Migration check finished with notice');
  }

  // 2. Initialize HTTP & Express Application
  const app = createApp();
  const server = http.createServer(app);

  // 3. Initialize Socket.IO Server
  const io = new SocketIOServer(server, {
    maxHttpBufferSize: 25 * 1024 * 1024, // 25MB max payload
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // 4. Redis Adapter for Horizontal Scaling (if REDIS_URL is configured)
  if (config.redisUrl) {
    try {
      const pubClient = new IORedis(config.redisUrl);
      const subClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter enabled for multi-instance cluster support.');
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis adapter for Socket.IO; using local memory adapter');
    }
  }

  // 5. Initialize Socket.IO Handlers
  initializeSocketServer(io);

  // 6. Start Asynchronous Moderation Worker
  const worker = new ModerationWorker(io);
  worker.start();

  // 7. Bind Server to Port
  server.listen(config.port, () => {
    logger.info(`ConnectUs Platform listening on http://localhost:${config.port}`);
    logger.info(`Prometheus Metrics available at http://localhost:${config.port}/metrics`);
    logger.info(`Health check available at http://localhost:${config.port}/health`);
  });

  // 8. Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown signal received. Terminating connections...');
    server.close(async () => {
      logger.info('HTTP server closed.');
      await worker.stop();
      await closeDatabasePool();
      logger.info('All resources released. Exiting.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during platform bootstrap');
  process.exit(1);
});
