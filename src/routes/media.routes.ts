import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StorageService } from '../services/StorageService';
import { getRepositories } from '../repositories/factory';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

const uploadSchema = z.object({
  data: z.string().min(1),
  type: z.string().min(1),
  messageId: z.string().optional(),
});

router.post('/upload', optionalAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = uploadSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid upload payload', parse.error.format());

    const uploaderId = req.user ? req.user.userId : 'anonymous';
    const repos = getRepositories();
    const storageService = new StorageService(repos.attachmentRepo);

    const attachment = await storageService.saveBase64Media(
      uploaderId,
      parse.data.data,
      parse.data.type,
      parse.data.messageId
    );

    res.status(201).json({ attachment });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const storageService = new StorageService(repos.attachmentRepo);
    const attachment = await storageService.getAttachment(req.params.id);
    if (!attachment) throw new NotFoundError('Attachment not found');

    res.json({ attachment });
  } catch (err) {
    next(err);
  }
});

export default router;
