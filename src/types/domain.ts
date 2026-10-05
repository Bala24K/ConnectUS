export type Role = 'admin' | 'mod' | 'member';

export interface User {
  id: string;
  username: string;
  passwordHash?: string;
  role: Role;
  isGuest?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  username: string;
  role: Role;
  socketId?: string;
  joinedAt: Date;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  isEdited: boolean;
  editedAt?: Date | string;
  isDeleted: boolean;
  deletedAt?: Date | string;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  messageId?: string;
  uploaderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageUrl: string;
  createdAt: Date;
}

export interface ModerationAction {
  id: string;
  roomId: string;
  actorId: string;
  actorUsername: string;
  targetId: string;
  targetUsername: string;
  actionType: 'kick' | 'timeout' | 'promote' | 'demote' | 'ai_warning' | 'strike';
  reason?: string;
  durationSeconds?: number;
  createdAt: Date;
}

export interface TimeoutRecord {
  roomId: string;
  userId: string;
  expiresAt: Date;
}
