import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../config';
import { ModerationJobData } from './types';
import { inMemoryJobBus } from './moderation.queue';
import { getModerationProvider } from '../moderation/provider.factory';
import { getRepositories } from '../repositories/factory';
import { logger } from '../observability/logger';
import {
  moderationJobsTotal,
  moderationJobDurationSeconds,
} from '../observability/metrics';

export class ModerationWorker {
  private io?: SocketIOServer;
  private bullWorker?: Worker;

  constructor(io?: SocketIOServer) {
    this.io = io;
  }

  setIO(io: SocketIOServer) {
    this.io = io;
  }

  async processJob(data: ModerationJobData): Promise<void> {
    const startTime = Date.now();
    logger.info({ jobId: data.jobId, userId: data.userId }, 'Processing AI moderation job');

    try {
      const provider = getModerationProvider();
      const result = await provider.generateSoothingReply(data.message);
      const duration = (Date.now() - startTime) / 1000;

      moderationJobsTotal.inc({ status: 'completed' });
      moderationJobDurationSeconds.observe(duration);

      const repos = getRepositories();

      // Record moderation action
      await repos.moderationRepo.recordAction({
        roomId: data.roomId,
        actorId: 'ai_moderator',
        actorUsername: 'AI Moderator',
        targetId: data.userId,
        targetUsername: data.userId,
        actionType: 'ai_warning',
        reason: result.soothingReply,
      });

      // Dispatch real-time updates via Socket.IO if available
      if (this.io) {
        const targetSocket = this.io.sockets.sockets.get(data.socketId);
        if (targetSocket) {
          targetSocket.emit('system', `🤖 AI Moderator:\n${result.soothingReply}`);

          if (data.strikes === 2) {
            const secs = 60;
            const exp = new Date(Date.now() + secs * 1000);
            await repos.moderationRepo.setTimeout(data.roomId, data.userId, exp);
            targetSocket.emit('muted', secs);
            targetSocket.emit('system', '⚠ You are muted for 60 seconds.');
          } else if (data.strikes >= 4) {
            targetSocket.emit('system', '🚫 You have been removed for repeated abuse.');
            targetSocket.disconnect(true);
          }
        }
      }

      logger.info(
        { jobId: data.jobId, durationMs: Date.now() - startTime, provider: result.provider },
        'AI moderation job completed successfully'
      );
    } catch (error) {
      moderationJobsTotal.inc({ status: 'failed' });
      logger.error({ error, jobId: data.jobId }, 'AI moderation job failed');
      throw error; // Let BullMQ retry
    }
  }

  start() {
    // Listen to in-memory events
    inMemoryJobBus.on('job', async (data: ModerationJobData) => {
      try {
        await this.processJob(data);
      } catch (err) {
        logger.error({ err }, 'In-memory job processor error');
      }
    });

    // If Redis is configured, start BullMQ worker
    if (config.redisUrl) {
      try {
        const redisConnection = new IORedis(config.redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

        redisConnection.on('error', () => {
          // handled
        });

        this.bullWorker = new Worker<ModerationJobData>(
          'moderation-queue',
          async (job: Job<ModerationJobData>) => {
            await this.processJob(job.data);
          },
          {
            connection: redisConnection as any,
            concurrency: 5,
          }
        );

        this.bullWorker.on('completed', (job) => {
          logger.debug({ jobId: job.id }, 'BullMQ job finished');
        });

        this.bullWorker.on('failed', (job, err) => {
          logger.warn({ jobId: job?.id, err }, 'BullMQ job failed attempt');
        });

        logger.info('BullMQ worker process started listening on Redis queue.');
      } catch (err) {
        logger.warn({ err }, 'Failed to start BullMQ worker; using in-memory bus only');
      }
    }
  }

  async stop() {
    if (this.bullWorker) {
      await this.bullWorker.close();
    }
  }
}
