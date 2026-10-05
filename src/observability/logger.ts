import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    service: 'connectus-backend',
    env: config.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
