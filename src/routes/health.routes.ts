import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../database';
import { register } from '../observability/metrics';
import { config } from '../config';

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
  });
});

router.get('/ready', async (req: Request, res: Response) => {
  const dbConnected = config.databaseUrl ? await checkDatabaseConnection() : true;
  const isReady = dbConnected;

  const status = isReady ? 200 : 503;
  res.status(status).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbConnected ? 'connected' : 'disconnected',
      storageDriver: config.storageDriver,
    },
  });
});

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (err) {
    res.status(500).send(err);
  }
});

export default router;
