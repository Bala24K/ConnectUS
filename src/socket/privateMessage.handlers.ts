import { Server } from 'socket.io';
import { AppSocket } from './socket.auth';
import { MessageService } from '../services/MessageService';
import { getRepositories } from '../repositories/factory';
import { chatMessagesTotal } from '../observability/metrics';

export function registerPrivateMessageHandlers(io: Server, socket: AppSocket) {
  const repos = getRepositories();
  const messageService = new MessageService(repos.messageRepo, repos.roomRepo);

  socket.on('startPrivate', ({ targetId }: { targetId: string }) => {
    const ids = [socket.id, targetId].sort();
    const pvRoom = `private_${ids[0]}_${ids[1]}`;
    socket.join(pvRoom);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.join(pvRoom);
    }

    socket.emit('privateStarted', { room: pvRoom });
    io.to(targetId).emit('privateStarted', { room: pvRoom });
  });

  socket.on('privateChatMessage', async ({ room, message }: { room: string; message: string }) => {
    const clean = message.trim();
    if (!clean || !room) return;

    // Persist private message
    await messageService.createPrivateMessage(socket.data.userId, 'recipient', room, clean);
    chatMessagesTotal.inc({ type: 'private' });

    io.to(room).emit('privateMessage', {
      user: socket.data.username,
      text: clean,
    });
  });

  socket.on('privateMediaMessage', ({ room, data, type }: { room: string; data: string; type: string }) => {
    if (!room) return;
    io.to(room).emit('privateMediaMessage', {
      user: socket.data.username,
      data,
      type,
    });
  });

  socket.on('leavePrivate', ({ room }: { room: string }) => {
    socket.to(room).emit('partnerLeft', { username: socket.data.username });
    socket.leave(room);
  });

  socket.on('privateTyping', ({ room }: { room: string }) => {
    socket.to(room).emit('privateUserTyping', { username: socket.data.username });
  });

  socket.on('privateStopTyping', ({ room }: { room: string }) => {
    socket.to(room).emit('privateUserStopTyping');
  });
}
