import {
  IUserRepository,
  IRoomRepository,
  IMessageRepository,
  IModerationRepository,
  IAttachmentRepository,
} from '../interfaces';
import { User, Room, RoomMember, Message, Role, ModerationAction, Attachment } from '../../types/domain';

export class MemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  async create(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date();
    const user: User = { ...userData, createdAt: now, updatedAt: now };
    this.users.set(user.id, user);
    return user;
  }

  async updateRole(id: string, role: Role): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.role = role;
    user.updatedAt = new Date();
    return user;
  }
}

export class MemoryRoomRepository implements IRoomRepository {
  private rooms = new Map<string, Room>();
  private members = new Map<string, Map<string, { role: Role; joinedAt: Date }>>(); // roomId -> userId -> { role, joinedAt }

  async findById(id: string): Promise<Room | null> {
    return this.rooms.get(id) || null;
  }

  async findByName(name: string): Promise<Room | null> {
    for (const room of this.rooms.values()) {
      if (room.name.toLowerCase() === name.toLowerCase()) {
        return room;
      }
    }
    return null;
  }

  async create(roomData: Omit<Room, 'createdAt' | 'updatedAt'>): Promise<Room> {
    const now = new Date();
    const room: Room = { ...roomData, createdAt: now, updatedAt: now };
    this.rooms.set(room.id, room);
    if (!this.members.has(room.id)) {
      this.members.set(room.id, new Map());
    }
    return room;
  }

  async rename(id: string, newName: string): Promise<Room | null> {
    const room = this.rooms.get(id);
    if (!room) return null;
    room.name = newName;
    room.updatedAt = new Date();
    return room;
  }

  async listAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async addMember(roomId: string, userId: string, role: Role): Promise<void> {
    if (!this.members.has(roomId)) {
      this.members.set(roomId, new Map());
    }
    this.members.get(roomId)!.set(userId, { role, joinedAt: new Date() });
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    this.members.get(roomId)?.delete(userId);
  }

  async getMembers(roomId: string): Promise<RoomMember[]> {
    const map = this.members.get(roomId);
    if (!map) return [];
    const result: RoomMember[] = [];
    for (const [userId, data] of map.entries()) {
      result.push({
        roomId,
        userId,
        username: userId,
        role: data.role,
        joinedAt: data.joinedAt,
      });
    }
    return result;
  }

  async getMemberRole(roomId: string, userId: string): Promise<Role | null> {
    return this.members.get(roomId)?.get(userId)?.role || null;
  }

  async updateMemberRole(roomId: string, userId: string, role: Role): Promise<void> {
    const mem = this.members.get(roomId)?.get(userId);
    if (mem) {
      mem.role = role;
    }
  }
}

export class MemoryMessageRepository implements IMessageRepository {
  private messages: Message[] = [];
  private privateMsgs: Array<{ id: string; senderId: string; recipientId: string; channel: string; text: string; createdAt: Date }> = [];

  async create(msgData: Omit<Message, 'createdAt'>): Promise<Message> {
    const message: Message = { ...msgData, createdAt: new Date() };
    this.messages.push(message);
    return message;
  }

  async findById(id: string): Promise<Message | null> {
    return this.messages.find((m) => m.id === id) || null;
  }

  async findByRoomCursor(
    roomId: string,
    limit: number,
    beforeCursor?: string
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    let roomMsgs = this.messages
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (beforeCursor) {
      const idx = roomMsgs.findIndex((m) => m.id === beforeCursor);
      if (idx !== -1) {
        roomMsgs = roomMsgs.slice(idx + 1);
      }
    }

    const sliced = roomMsgs.slice(0, limit);
    const nextCursor = roomMsgs.length > limit ? sliced[sliced.length - 1].id : null;

    return {
      messages: sliced.reverse(), // chronologically ordered
      nextCursor,
    };
  }

  async updateText(id: string, newText: string, editedAt: Date): Promise<Message | null> {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg || msg.isDeleted) return null;
    msg.text = newText;
    msg.isEdited = true;
    msg.editedAt = editedAt;
    return msg;
  }

  async softDelete(id: string, deletedAt: Date): Promise<Message | null> {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg || msg.isDeleted) return null;
    msg.isDeleted = true;
    msg.deletedAt = deletedAt;
    return msg;
  }

  async createPrivate(senderId: string, recipientId: string, channel: string, text: string): Promise<void> {
    this.privateMsgs.push({
      id: `pmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId,
      recipientId,
      channel,
      text,
      createdAt: new Date(),
    });
  }
}

export class MemoryModerationRepository implements IModerationRepository {
  private actions: ModerationAction[] = [];
  private timeouts = new Map<string, Date>(); // key: `${roomId}:${userId}`

  async recordAction(actionData: Omit<ModerationAction, 'id' | 'createdAt'>): Promise<ModerationAction> {
    const action: ModerationAction = {
      ...actionData,
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(),
    };
    this.actions.push(action);
    return action;
  }

  async setTimeout(roomId: string, userId: string, expiresAt: Date): Promise<void> {
    this.timeouts.set(`${roomId}:${userId}`, expiresAt);
  }

  async getTimeout(roomId: string, userId: string): Promise<Date | null> {
    const exp = this.timeouts.get(`${roomId}:${userId}`);
    if (!exp) return null;
    if (Date.now() > exp.getTime()) {
      this.timeouts.delete(`${roomId}:${userId}`);
      return null;
    }
    return exp;
  }

  async removeTimeout(roomId: string, userId: string): Promise<void> {
    this.timeouts.delete(`${roomId}:${userId}`);
  }

  async getLogs(roomId?: string, limit = 50): Promise<ModerationAction[]> {
    let filtered = this.actions;
    if (roomId) {
      filtered = filtered.filter((a) => a.roomId === roomId);
    }
    return filtered.slice(-limit).reverse();
  }
}

export class MemoryAttachmentRepository implements IAttachmentRepository {
  private attachments = new Map<string, Attachment>();

  async create(data: Omit<Attachment, 'createdAt'>): Promise<Attachment> {
    const attachment: Attachment = { ...data, createdAt: new Date() };
    this.attachments.set(attachment.id, attachment);
    return attachment;
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.attachments.get(id) || null;
  }
}
