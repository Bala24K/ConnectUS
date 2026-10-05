import { v4 as uuidv4 } from 'uuid';
import { IMessageRepository, IRoomRepository } from '../repositories/interfaces';
import { Message, Role } from '../types/domain';

export class MessageService {
  constructor(
    private messageRepo: IMessageRepository,
    private roomRepo: IRoomRepository
  ) {}

  async createMessage(
    roomId: string,
    userId: string,
    username: string,
    text: string,
    customId?: string
  ): Promise<Message> {
    const id = customId || `msg_${Date.now()}_${uuidv4().slice(0, 6)}`;
    return this.messageRepo.create({
      id,
      roomId,
      userId,
      username,
      text,
      isEdited: false,
      isDeleted: false,
    });
  }

  async getMessages(
    roomId: string,
    limit = 50,
    beforeCursor?: string
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const validLimit = Math.min(Math.max(limit, 1), 100);
    return this.messageRepo.findByRoomCursor(roomId, validLimit, beforeCursor);
  }

  async editMessage(messageId: string, actorUserId: string, newText: string): Promise<Message> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg) throw new Error('Message not found');
    if (msg.isDeleted) throw new Error('Cannot edit a deleted message');
    if (msg.userId !== actorUserId) throw new Error('Unauthorized to edit this message');

    const clean = newText.trim();
    if (!clean) throw new Error('Message text cannot be empty');

    const updated = await this.messageRepo.updateText(messageId, clean, new Date());
    if (!updated) throw new Error('Failed to update message');
    return updated;
  }

  async deleteMessage(
    messageId: string,
    roomId: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<{ message: Message; deletedBy: 'author' | 'moderator' }> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg) throw new Error('Message not found');
    if (msg.isDeleted) throw new Error('Message already deleted');

    const isOwn = msg.userId === actorUserId;
    if (!isOwn) {
      const targetRole = (await this.roomRepo.getMemberRole(roomId, msg.userId)) || 'member';
      const canDeleteOther =
        actorRole === 'admin' || (actorRole === 'mod' && targetRole === 'member');
      if (!canDeleteOther) {
        throw new Error('Insufficient permissions to delete this message');
      }
    }

    const updated = await this.messageRepo.softDelete(messageId, new Date());
    if (!updated) throw new Error('Failed to delete message');
    return {
      message: updated,
      deletedBy: isOwn ? 'author' : 'moderator',
    };
  }

  async createPrivateMessage(
    senderId: string,
    recipientId: string,
    channel: string,
    text: string
  ): Promise<void> {
    await this.messageRepo.createPrivate(senderId, recipientId, channel, text);
  }
}
