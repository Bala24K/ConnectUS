import { User, Room, RoomMember, Message, Role, ModerationAction, Attachment } from '../types/domain';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  updateRole(id: string, role: Role): Promise<User | null>;
}

export interface IRoomRepository {
  findById(id: string): Promise<Room | null>;
  findByName(name: string): Promise<Room | null>;
  create(room: Omit<Room, 'createdAt' | 'updatedAt'>): Promise<Room>;
  rename(id: string, newName: string): Promise<Room | null>;
  listAll(): Promise<Room[]>;
  addMember(roomId: string, userId: string, role: Role): Promise<void>;
  removeMember(roomId: string, userId: string): Promise<void>;
  getMembers(roomId: string): Promise<RoomMember[]>;
  getMemberRole(roomId: string, userId: string): Promise<Role | null>;
  updateMemberRole(roomId: string, userId: string, role: Role): Promise<void>;
}

export interface IMessageRepository {
  create(message: Omit<Message, 'createdAt'>): Promise<Message>;
  findById(id: string): Promise<Message | null>;
  findByRoomCursor(roomId: string, limit: number, beforeCursor?: string): Promise<{ messages: Message[]; nextCursor: string | null }>;
  updateText(id: string, newText: string, editedAt: Date): Promise<Message | null>;
  softDelete(id: string, deletedAt: Date): Promise<Message | null>;
  createPrivate(senderId: string, recipientId: string, channel: string, text: string): Promise<void>;
}

export interface IModerationRepository {
  recordAction(action: Omit<ModerationAction, 'id' | 'createdAt'>): Promise<ModerationAction>;
  setTimeout(roomId: string, userId: string, expiresAt: Date): Promise<void>;
  getTimeout(roomId: string, userId: string): Promise<Date | null>;
  removeTimeout(roomId: string, userId: string): Promise<void>;
  getLogs(roomId?: string, limit?: number): Promise<ModerationAction[]>;
}

export interface IAttachmentRepository {
  create(attachment: Omit<Attachment, 'createdAt'>): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
}
