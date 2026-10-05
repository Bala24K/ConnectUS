import { Server } from 'socket.io';
import { socketAuthMiddleware, AppSocket } from './socket.auth';
import { registerRoomHandlers } from './room.handlers';
import { registerChatHandlers } from './chat.handlers';
import { registerModerationHandlers } from './moderation.handlers';
import { registerPresenceHandlers } from './presence.handlers';
import { registerPrivateMessageHandlers } from './privateMessage.handlers';
import {
  socketConnectionsActive,
  socketConnectionsTotal,
  socketDisconnectsTotal,
} from '../observability/metrics';
import { logger } from '../observability/logger';

export function initializeSocketServer(io: Server) {
  // Authentication middleware
  io.use(socketAuthMiddleware as any);

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AppSocket;

    socketConnectionsTotal.inc();
    socketConnectionsActive.inc();

    logger.debug({ socketId: socket.id, user: socket.data.username }, 'Client connected to Socket.IO');

    // Register modular handler groups
    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerModerationHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerPrivateMessageHandlers(io, socket);

    socket.on('disconnect', () => {
      socketConnectionsActive.dec();
      socketDisconnectsTotal.inc();
      logger.debug({ socketId: socket.id }, 'Client disconnected from Socket.IO');
    });
  });
}
