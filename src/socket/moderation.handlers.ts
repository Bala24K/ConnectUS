import { Server } from 'socket.io';
import { AppSocket } from './socket.auth';
import { ModerationService } from '../services/ModerationService';
import { RoomService } from '../services/RoomService';
import { getRepositories } from '../repositories/factory';
import { broadcastRoomUsers, activeRoomUsers } from './room.handlers';
import { logger } from '../observability/logger';

export function registerModerationHandlers(io: Server, socket: AppSocket) {
  const repos = getRepositories();
  const modService = new ModerationService(repos.moderationRepo);
  const roomService = new RoomService(repos.roomRepo);

  socket.on('promoteUser', async ({ targetId }: { targetId: string }) => {
    const room = socket.data.room;
    if (!room || socket.data.role !== 'admin') return;

    const roomMap = activeRoomUsers.get(room);
    const targetUser = roomMap?.get(targetId);
    if (!targetUser || targetUser.role !== 'member') return;

    targetUser.role = 'mod';
    const targetSocket = io.sockets.sockets.get(targetId) as AppSocket | undefined;
    if (targetSocket) {
      targetSocket.data.role = 'mod';
      targetSocket.emit('roleChanged', { role: 'mod' });
      targetSocket.emit('system', '🛡️ You have been promoted to Moderator.');
    }

    io.to(room).emit('system', `🛡️ ${targetUser.username} has been promoted to Moderator.`);
    broadcastRoomUsers(io, room);

    logger.info({ actor: socket.data.username, target: targetUser.username, room }, 'User promoted to moderator');
  });

  socket.on('demoteUser', async ({ targetId }: { targetId: string }) => {
    const room = socket.data.room;
    if (!room || socket.data.role !== 'admin') return;

    const roomMap = activeRoomUsers.get(room);
    const targetUser = roomMap?.get(targetId);
    if (!targetUser || targetUser.role !== 'mod') return;

    targetUser.role = 'member';
    const targetSocket = io.sockets.sockets.get(targetId) as AppSocket | undefined;
    if (targetSocket) {
      targetSocket.data.role = 'member';
      targetSocket.emit('roleChanged', { role: 'member' });
      targetSocket.emit('system', 'You have been demoted to Member.');
    }

    io.to(room).emit('system', `${targetUser.username} has been demoted to Member.`);
    broadcastRoomUsers(io, room);

    logger.info({ actor: socket.data.username, target: targetUser.username, room }, 'User demoted to member');
  });

  socket.on('kickUser', async ({ targetId }: { targetId: string }) => {
    const room = socket.data.room;
    if (!room) return;

    const roomMap = activeRoomUsers.get(room);
    const targetUser = roomMap?.get(targetId);
    if (!targetUser) return;

    if (!modService.canModerate(socket.data.role || 'member', targetUser.role)) {
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('kicked', { by: socket.data.username });
      setTimeout(() => targetSocket.disconnect(true), 600);
    }

    await modService.recordKick(
      room,
      socket.data.userId,
      socket.data.username,
      targetId,
      targetUser.username
    );

    const actLabel = socket.data.role === 'admin' ? 'Admin' : 'Mod';
    io.to(room).emit('system', `🚪 ${targetUser.username} was kicked by ${actLabel}.`);

    logger.info({ actor: socket.data.username, target: targetUser.username, room }, 'User kicked from room');
  });

  socket.on('timeoutUser', async ({ targetId, duration }: { targetId: string; duration: number | string }) => {
    const room = socket.data.room;
    if (!room) return;

    const roomMap = activeRoomUsers.get(room);
    const targetUser = roomMap?.get(targetId);
    if (!targetUser) return;

    if (!modService.canModerate(socket.data.role || 'member', targetUser.role)) {
      return;
    }

    const secs = Math.min(Math.max(parseInt(String(duration), 10) || 60, 10), 600);
    await modService.setTimeout(
      room,
      socket.data.userId,
      socket.data.username,
      targetId,
      targetUser.username,
      secs
    );

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('muted', secs);
      targetSocket.emit('system', `⏱ You have been timed out for ${secs}s.`);
    }

    socket.emit('system', `⏱ Timed out ${targetUser.username} for ${secs}s.`);

    logger.info({ actor: socket.data.username, target: targetUser.username, duration: secs, room }, 'User timed out');
  });
}
