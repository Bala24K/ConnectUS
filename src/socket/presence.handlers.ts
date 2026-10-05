import { Server } from 'socket.io';
import { AppSocket } from './socket.auth';

export function registerPresenceHandlers(io: Server, socket: AppSocket) {
  socket.on('typing', () => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('userTyping', { username: socket.data.username, id: socket.id });
  });

  socket.on('stopTyping', () => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('userStopTyping', { id: socket.id });
  });
}
