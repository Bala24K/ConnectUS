import { getDatabasePool, isDatabaseHealthy } from '../database';
import {
  IUserRepository,
  IRoomRepository,
  IMessageRepository,
  IModerationRepository,
  IAttachmentRepository,
} from './interfaces';
import {
  MemoryUserRepository,
  MemoryRoomRepository,
  MemoryMessageRepository,
  MemoryModerationRepository,
  MemoryAttachmentRepository,
} from './memory';
import {
  PgUserRepository,
  PgRoomRepository,
  PgMessageRepository,
  PgModerationRepository,
  PgAttachmentRepository,
} from './pg';
import { logger } from '../observability/logger';

export interface RepositoryContainer {
  userRepo: IUserRepository;
  roomRepo: IRoomRepository;
  messageRepo: IMessageRepository;
  moderationRepo: IModerationRepository;
  attachmentRepo: IAttachmentRepository;
}

let container: RepositoryContainer | null = null;

export function initializeRepositories(forceMemory = false): RepositoryContainer {
  if (container) return container;

  const pool = getDatabasePool();
  if (pool && isDatabaseHealthy() && !forceMemory) {
    logger.info('Initializing PostgreSQL Repositories.');
    container = {
      userRepo: new PgUserRepository(pool),
      roomRepo: new PgRoomRepository(pool),
      messageRepo: new PgMessageRepository(pool),
      moderationRepo: new PgModerationRepository(pool),
      attachmentRepo: new PgAttachmentRepository(pool),
    };
  } else {
    logger.info('Initializing In-Memory Repositories.');
    container = {
      userRepo: new MemoryUserRepository(),
      roomRepo: new MemoryRoomRepository(),
      messageRepo: new MemoryMessageRepository(),
      moderationRepo: new MemoryModerationRepository(),
      attachmentRepo: new MemoryAttachmentRepository(),
    };
  }

  return container;
}

export function getRepositories(): RepositoryContainer {
  if (!container) {
    return initializeRepositories();
  }
  return container;
}
