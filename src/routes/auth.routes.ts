import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';
import { getRepositories } from '../repositories/factory';
import { authMiddleware } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiter.middleware';
import { ValidationError } from '../middleware/errorHandler';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(['admin', 'mod', 'member']).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().optional(),
});

const guestSchema = z.object({
  username: z.string().min(2).max(32),
});

router.post('/register', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid input data', parse.error.format());

    const repos = getRepositories();
    const authService = new AuthService(repos.userRepo);
    const result = await authService.register(parse.data.username, parse.data.password, parse.data.role);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid credentials payload', parse.error.format());

    const repos = getRepositories();
    const authService = new AuthService(repos.userRepo);
    const result = await authService.login(parse.data.username, parse.data.password);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/guest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = guestSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid guest username', parse.error.format());

    const repos = getRepositories();
    const authService = new AuthService(repos.userRepo);
    const result = await authService.createGuestSession(parse.data.username);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
