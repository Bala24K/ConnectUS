import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RoomService } from '../services/RoomService';
import { MessageService } from '../services/MessageService';
import { getRepositories } from '../repositories/factory';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

const createRoomSchema = z.object({
  name: z.string().min(2).max(64),
});

const renameRoomSchema = z.object({
  name: z.string().min(2).max(64),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const roomService = new RoomService(repos.roomRepo);
    const rooms = await roomService.listRooms();
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = createRoomSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid room name', parse.error.format());

    const repos = getRepositories();
    const roomService = new RoomService(repos.roomRepo);
    const { room, isNew } = await roomService.createOrGetRoom(parse.data.name, req.user!.userId);

    // Auto add creator as admin
    await roomService.joinRoom(room.id, req.user!.userId, 'admin');

    res.status(isNew ? 201 : 200).json({ room, isNew });
  } catch (err) {
    next(err);
  }
});

router.get('/:roomId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const roomService = new RoomService(repos.roomRepo);
    const room = await roomService.getRoom(req.params.roomId);
    if (!room) throw new NotFoundError('Room not found');
    res.json({ room });
  } catch (err) {
    next(err);
  }
});

router.get('/:roomId/messages', optionalAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const beforeCursor = req.query.before as string | undefined;

    const repos = getRepositories();
    const messageService = new MessageService(repos.messageRepo, repos.roomRepo);
    const result = await messageService.getMessages(req.params.roomId, limit, beforeCursor);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:roomId/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = getRepositories();
    const roomService = new RoomService(repos.roomRepo);
    const members = await roomService.getMembers(req.params.roomId);
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

router.patch('/:roomId/rename', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = renameRoomSchema.safeParse(req.body);
    if (!parse.success) throw new ValidationError('Invalid room name', parse.error.format());

    const repos = getRepositories();
    const roomService = new RoomService(repos.roomRepo);
    const updated = await roomService.renameRoom(req.params.roomId, req.user!.userId, parse.data.name);

    res.json({ room: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
