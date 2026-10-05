import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { correlationMiddleware } from './middleware/correlation.middleware';
import { errorHandler } from './middleware/errorHandler';
import { httpRequestsTotal, httpRequestDurationSeconds } from './observability/metrics';
import authRoutes from './routes/auth.routes';
import roomRoutes from './routes/room.routes';
import mediaRoutes from './routes/media.routes';
import moderationRoutes from './routes/moderation.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): express.Application {
  const app = express();

  // 1. Security & Core Middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow client scripts and styles in static UI
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(correlationMiddleware);

  // 2. Metrics & Request Tracking Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();

    res.on('finish', () => {
      const diff = process.hrtime(start);
      const durationSeconds = diff[0] + diff[1] / 1e9;
      const route = req.route ? req.route.path : req.path;

      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      });

      httpRequestDurationSeconds.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode.toString(),
        },
        durationSeconds
      );
    });

    next();
  });

  // 3. Static Assets (Preserves existing frontend)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // 4. REST Endpoints
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/moderation', moderationRoutes);
  app.use('/', healthRoutes);

  // 5. Error Handling
  app.use(errorHandler);

  return app;
}
