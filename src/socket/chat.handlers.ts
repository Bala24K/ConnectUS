import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { AppSocket } from './socket.auth';
import { MessageService } from '../services/MessageService';
import { ModerationService } from '../services/ModerationService';
import { StorageService } from '../services/StorageService';
import { getRepositories } from '../repositories/factory';
import { getModerationQueue } from '../jobs/moderation.queue';
import { chatMessagesTotal } from '../observability/metrics';
import { logger } from '../observability/logger';

function ts(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function registerChatHandlers(io: Server, socket: AppSocket) {
  const repos = getRepositories();
  const messageService = new MessageService(repos.messageRepo, repos.roomRepo);
  const modService = new ModerationService(repos.moderationRepo);
  const storageService = new StorageService(repos.attachmentRepo);
  const modQueue = getModerationQueue();

  socket.on('chatMessage', async (message: string) => {
    const room = socket.data.room;
    if (!room) return;

    const clean = message.trim();
    if (!clean) return;

    // 1. Check if user is currently muted
    const muteStatus = await modService.isUserMuted(room, socket.data.userId);
    if (muteStatus.muted) {
      socket.emit('muted', muteStatus.secondsRemaining);
      return;
    }

    // 2. Sensitive pattern checks (OTP detection)
    if (modService.detectOTP(clean)) {
      socket.emit('otpWarning');
      return;
    }

    // 3. Troll / toxicity check -> asynchronous worker delegation
    if (modService.detectTroll(clean)) {
      const strikes = modService.addStrike(socket.data.userId);

      // Enqueue job to background BullMQ queue (does NOT block the socket event loop!)
      const jobId = `job_${uuidv4()}`;
      await modQueue.add('moderate-message', {
        jobId,
        roomId: room,
        userId: socket.data.userId,
        socketId: socket.id,
        message: clean,
        strikes,
      });

      if (strikes === 2) {
        socket.emit('system', '⚠ Warning: Your recent messages violated chat guidelines.');
        return;
      }
      if (strikes >= 4) {
        socket.emit('system', '🚫 Disconnected due to repeated guideline violations.');
        socket.disconnect(true);
        return;
      }
      return;
    }

    // 4. Persist message in PostgreSQL / Repository
    const msgId = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    await messageService.createMessage(room, socket.data.userId, socket.data.username, clean, msgId);

    chatMessagesTotal.inc({ type: 'room' });

    // 5. Broadcast to room participants
    io.to(room).emit('message', {
      user: socket.data.username,
      text: clean,
      id: socket.id,
      msgId,
    });
  });

  socket.on('chatMessageConfirmed', async (message: string) => {
    const room = socket.data.room;
    if (!room) return;

    const msgId = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    await messageService.createMessage(room, socket.data.userId, socket.data.username, message, msgId);
    chatMessagesTotal.inc({ type: 'room' });

    io.to(room).emit('message', {
      user: socket.data.username,
      text: message,
      id: socket.id,
      msgId,
    });
  });

  socket.on('editMessage', async ({ msgId, newText }: { msgId: string; newText: string }) => {
    const room = socket.data.room;
    if (!room) return;

    try {
      await messageService.editMessage(msgId, socket.data.userId, newText);
      const editedAt = ts();
      io.to(room).emit('messageEdited', { msgId, newText: newText.trim(), editedAt });
    } catch (err: any) {
      logger.warn({ err, msgId, userId: socket.data.userId }, 'Failed to edit message');
    }
  });

  socket.on('deleteMessage', async ({ msgId }: { msgId: string }) => {
    const room = socket.data.room;
    if (!room) return;

    try {
      await messageService.deleteMessage(msgId, room, socket.data.userId, socket.data.role || 'member');
      const deletedAt = ts();
      io.to(room).emit('messageDeleted', { msgId, deletedAt });
    } catch (err: any) {
      logger.warn({ err, msgId, userId: socket.data.userId }, 'Failed to delete message');
    }
  });

  socket.on('mediaMessage', async ({ data, type }: { data: string; type: string }) => {
    const room = socket.data.room;
    if (!room) return;

    try {
      // Save media to storage
      await storageService.saveBase64Media(socket.data.userId, data, type);
      chatMessagesTotal.inc({ type: 'media' });

      io.to(room).emit('mediaMessage', {
        user: socket.data.username,
        data,
        type,
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to save and broadcast media message');
    }
  });
}
