import { Queue } from 'bullmq';
import { EventEmitter } from 'events';
import IORedis from 'ioredis';
import { config } from '../config';
import { ModerationJobData } from './types';
import { logger } from '../observability/logger';
import { moderationJobsTotal } from '../observability/metrics';

export interface IModerationQueue {
  add(name: string, data: ModerationJobData): Promise<void>;
  close(): Promise<void>;
}

class InMemoryQueue extends EventEmitter implements IModerationQueue {
  private queue: ModerationJobData[] = [];

  async add(name: string, data: ModerationJobData): Promise<void> {
    this.queue.push(data);
    moderationJobsTotal.inc({ status: 'queued' });
    setImmediate(() => this.emit('job', data));
  }

  async close(): Promise<void> {
    this.queue = [];
  }
}

let queueInstance: IModerationQueue | null = null;
export const inMemoryJobBus = new InMemoryQueue();

export function getModerationQueue(): IModerationQueue {
  if (queueInstance) return queueInstance;

  if (config.redisUrl) {
    try {
      const redisConnection = new IORedis(config.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) return null; // Stop retrying after 3 attempts, fallback to in-memory
          return Math.min(times * 500, 2000);
        },
      });

      redisConnection.on('error', (err) => {
        logger.warn({ err }, 'Redis connection error for BullMQ; switching to in-memory queue');
      });

      const bullQueue = new Queue<ModerationJobData>('moderation-queue', {
        connection: redisConnection as any,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });

      queueInstance = {
        async add(name: string, data: ModerationJobData) {
          try {
            await bullQueue.add(name, data);
            moderationJobsTotal.inc({ status: 'queued' });
          } catch (err) {
            logger.warn({ err }, 'Failed to enqueue to BullMQ; falling back to in-memory event bus');
            await inMemoryJobBus.add(name, data);
          }
        },
        async close() {
          await bullQueue.close();
          await redisConnection.quit();
        },
      };

      logger.info('Initialized BullMQ Queue with Redis backend.');
      return queueInstance;
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize BullMQ; fallback to in-memory queue');
    }
  }

  logger.info('No REDIS_URL configured; using in-memory moderation queue.');
  queueInstance = inMemoryJobBus;
  return queueInstance;
}
