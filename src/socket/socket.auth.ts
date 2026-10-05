import { Socket } from 'socket.io';
import { AuthService } from '../services/AuthService';
import { getRepositories } from '../repositories/factory';
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '../types/socket';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../observability/logger';

export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export async function socketAuthMiddleware(socket: AppSocket, next: (err?: Error) => void) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null);

    const repos = getRepositories();
    const authService = new AuthService(repos.userRepo);

    if (token) {
      try {
        const payload = authService.verifyToken(token);
        socket.data.userId = payload.userId;
        socket.data.username = payload.username;
        socket.data.role = payload.role;
        socket.data.isGuest = !!payload.isGuest;
        logger.debug({ userId: payload.userId, username: payload.username }, 'Socket authenticated via JWT');
        return next();
      } catch (tokenErr) {
        logger.warn({ tokenErr }, 'Invalid JWT in socket handshake; proceeding as guest');
      }
    }

    // Fallback: anonymous / guest session for instant backward compatibility with legacy web client
    const fallbackUsername = socket.handshake.auth?.username || `User_${socket.id.slice(0, 4)}`;
    const guestUser = await authService.createGuestSession(fallbackUsername);

    socket.data.userId = guestUser.user.id;
    socket.data.username = guestUser.user.username;
    socket.data.role = 'member';
    socket.data.isGuest = true;

    return next();
  } catch (error: any) {
    logger.error({ error }, 'Socket authentication middleware failed');
    return next(new Error('Authentication failed'));
  }
}
