import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  jwtSecret: string;
  jwtExpiry: string;
  databaseUrl?: string;
  dbPoolMax: number;
  redisUrl?: string;
  geminiApiKey?: string;
  geminiModel: string;
  storageDriver: 'local' | 's3';
  objectStorageEndpoint?: string;
  objectStorageBucket: string;
  objectStorageAccessKey?: string;
  objectStorageSecretKey?: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-super-secure-key-at-least-32-chars-long!',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  databaseUrl: process.env.DATABASE_URL,
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  redisUrl: process.env.REDIS_URL,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  storageDriver: (process.env.STORAGE_DRIVER as 'local' | 's3') || 'local',
  objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET || 'connectus-media',
  objectStorageAccessKey: process.env.OBJECT_STORAGE_ACCESS_KEY,
  objectStorageSecretKey: process.env.OBJECT_STORAGE_SECRET_KEY,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10),
};
