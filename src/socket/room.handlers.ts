import { Server } from 'socket.io';
import { AppSocket } from './socket.auth';
import { RoomService } from '../services/RoomService';
import { getRepositories } from '../repositories/factory';
import { logger } from '../observability/logger';

// In-memory lookup for active socket mappings within rooms
export const activeRoomUsers = new Map<string, Map<string, { socketId: string; username: string; role: any }>>();

export function broadcastRoomUsers(io: Server, room: string) {
  const usersMap = activeRoomUsers.get(room);
  if (!usersMap) return;

  const users = Array.from(usersMap.values()).map((u) => ({
    id: u.socketId,
    username: u.username,
    role: u.role,
  }));

  io.to(room).emit('roomUsers', users);
}

export function registerRoomHandlers(io: Server, socket: AppSocket) {
  const repos = getRepositories();
  const roomService = new RoomService(repos.roomRepo);

  socket.on('joinRoom', async ({ username, room }) => {
    if (!username || !room) return;

    const cleanUsername = username.trim();
    const cleanRoom = room.trim();

    socket.data.username = cleanUsername;
    socket.data.room = cleanRoom;
    socket.join(cleanRoom);

    // Persist room in database/repository
    const { room: dbRoom } = await roomService.createOrGetRoom(cleanRoom, socket.data.userId);

    if (!activeRoomUsers.has(cleanRoom)) {
      activeRoomUsers.set(cleanRoom, new Map());
    }

    const roomMap = activeRoomUsers.get(cleanRoom)!;
    const isFirstUser = roomMap.size === 0;
    const assignedRole = isFirstUser ? 'admin' : (socket.data.role || 'member');
    socket.data.role = assignedRole;

    roomMap.set(socket.id, {
      socketId: socket.id,
      username: cleanUsername,
      role: assignedRole,
    });

    // Record membership
    await roomService.joinRoom(dbRoom.id, socket.data.userId, assignedRole);

    socket.emit('myRole', { role: assignedRole });

    if (dbRoom.name !== cleanRoom) {
      socket.emit('roomRenamed', { newName: dbRoom.name });
    }

    io.to(cleanRoom).emit('system', `${cleanUsername} joined the room`);
    broadcastRoomUsers(io, cleanRoom);

    logger.info({ userId: socket.data.userId, username: cleanUsername, room: cleanRoom }, 'User joined room');
  });

  socket.on('changeRoomName', async ({ newName }) => {
    const room = socket.data.room;
    if (!room) return;

    if (socket.data.role !== 'admin') {
      socket.emit('system', 'Only administrators can rename the room.');
      return;
    }

    const clean = newName?.trim().slice(0, 30);
    if (!clean) return;

    try {
      await roomService.renameRoom(room, socket.data.userId, clean);
      io.to(room).emit('roomRenamed', { newName: clean });
      io.to(room).emit('system', `📝 Room renamed to "${clean}".`);
    } catch (err: any) {
      socket.emit('system', `Error renaming room: ${err.message}`);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;

    // Handle private room notifications
    for (const r of socket.rooms) {
      if (r.startsWith('private_')) {
        socket.to(r).emit('partnerLeft', { username: socket.data.username });
      }
    }

    const roomMap = activeRoomUsers.get(room);
    if (roomMap) {
      roomMap.delete(socket.id);
      if (roomMap.size === 0) {
        activeRoomUsers.delete(room);
      }
    }

    io.to(room).emit('system', `${socket.data.username} left the room`);
    broadcastRoomUsers(io, room);
    io.emit('userDisconnected', socket.id);

    logger.info({ userId: socket.data.userId, username: socket.data.username, room }, 'User disconnected');
  });
}
