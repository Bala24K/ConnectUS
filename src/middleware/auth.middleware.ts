import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { getRepositories } from '../repositories/factory';
import { JWTPayload } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const repos = getRepositories();
    const authService = new AuthService(repos.userRepo);
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const repos = getRepositories();
      const authService = new AuthService(repos.userRepo);
      req.user = authService.verifyToken(token);
    } catch {
      // Ignore optional auth error
    }
  }
  next();
}
