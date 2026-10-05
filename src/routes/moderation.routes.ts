import { Router, Request, Response, NextFunction } from 'express';
import { ModerationService } from '../services/ModerationService';
import { getRepositories } from '../repositories/factory';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/logs', authMiddleware, requireRole('mod'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = req.query.roomId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const repos = getRepositories();
    const modService = new ModerationService(repos.moderationRepo);
    const logs = await modService.getLogs(roomId, limit);

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
