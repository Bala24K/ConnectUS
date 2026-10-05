import { Pool } from 'pg';
import {
  IUserRepository,
  IRoomRepository,
  IMessageRepository,
  IModerationRepository,
  IAttachmentRepository,
} from '../interfaces';
import { User, Room, RoomMember, Message, Role, ModerationAction, Attachment } from '../../types/domain';

export class PgUserRepository implements IUserRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<User | null> {
    const res = await this.pool.query(
      'SELECT id, username, password_hash, role, is_guest, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.password_hash,
      role: r.role as Role,
      isGuest: r.is_guest,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    const res = await this.pool.query(
      'SELECT id, username, password_hash, role, is_guest, created_at, updated_at FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.password_hash,
      role: r.role as Role,
      isGuest: r.is_guest,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const res = await this.pool.query(
      `INSERT INTO users (id, username, password_hash, role, is_guest, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, username, password_hash, role, is_guest, created_at, updated_at`,
      [user.id, user.username, user.passwordHash || null, user.role, user.isGuest || false]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.password_hash,
      role: r.role as Role,
      isGuest: r.is_guest,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async updateRole(id: string, role: Role): Promise<User | null> {
    const res = await this.pool.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, password_hash, role, is_guest, created_at, updated_at`,
      [role, id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      username: r.username,
      passwordHash: r.password_hash,
      role: r.role as Role,
      isGuest: r.is_guest,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

export class PgRoomRepository implements IRoomRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<Room | null> {
    const res = await this.pool.query('SELECT id, name, created_by, created_at, updated_at FROM rooms WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return { id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async findByName(name: string): Promise<Room | null> {
    const res = await this.pool.query('SELECT id, name, created_by, created_at, updated_at FROM rooms WHERE LOWER(name) = LOWER($1)', [name]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return { id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async create(room: Omit<Room, 'createdAt' | 'updatedAt'>): Promise<Room> {
    const res = await this.pool.query(
      `INSERT INTO rooms (id, name, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, name, created_by, created_at, updated_at`,
      [room.id, room.name, room.createdBy]
    );
    const r = res.rows[0];
    return { id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async rename(id: string, newName: string): Promise<Room | null> {
    const res = await this.pool.query(
      `UPDATE rooms SET name = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, name, created_by, created_at, updated_at`,
      [newName, id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return { id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async listAll(): Promise<Room[]> {
    const res = await this.pool.query('SELECT id, name, created_by, created_at, updated_at FROM rooms ORDER BY created_at DESC');
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async addMember(roomId: string, userId: string, role: Role): Promise<void> {
    await this.pool.query(
      `INSERT INTO room_members (room_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [roomId, userId, role]
    );
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  }

  async getMembers(roomId: string): Promise<RoomMember[]> {
    const res = await this.pool.query(
      `SELECT rm.room_id, rm.user_id, u.username, rm.role, rm.joined_at
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1`,
      [roomId]
    );
    return res.rows.map((r) => ({
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      role: r.role as Role,
      joinedAt: r.joined_at,
    }));
  }

  async getMemberRole(roomId: string, userId: string): Promise<Role | null> {
    const res = await this.pool.query('SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
    return res.rows[0] ? (res.rows[0].role as Role) : null;
  }

  async updateMemberRole(roomId: string, userId: string, role: Role): Promise<void> {
    await this.pool.query('UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_id = $3', [role, roomId, userId]);
  }
}

export class PgMessageRepository implements IMessageRepository {
  constructor(private pool: Pool) {}

  async create(msg: Omit<Message, 'createdAt'>): Promise<Message> {
    const res = await this.pool.query(
      `INSERT INTO messages (id, room_id, user_id, username, text, is_edited, is_deleted, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at`,
      [msg.id, msg.roomId, msg.userId, msg.username, msg.text, msg.isEdited || false, msg.isDeleted || false]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      text: r.text,
      isEdited: r.is_edited,
      editedAt: r.edited_at,
      isDeleted: r.is_deleted,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  }

  async findById(id: string): Promise<Message | null> {
    const res = await this.pool.query(
      `SELECT id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at
       FROM messages WHERE id = $1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      text: r.text,
      isEdited: r.is_edited,
      editedAt: r.edited_at,
      isDeleted: r.is_deleted,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  }

  async findByRoomCursor(
    roomId: string,
    limit: number,
    beforeCursor?: string
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    let query: string;
    let params: any[];

    if (beforeCursor) {
      query = `
        SELECT id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at
        FROM messages
        WHERE room_id = $1
          AND created_at < (SELECT created_at FROM messages WHERE id = $2)
        ORDER BY created_at DESC
        LIMIT $3
      `;
      params = [roomId, beforeCursor, limit + 1];
    } else {
      query = `
        SELECT id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at
        FROM messages
        WHERE room_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      params = [roomId, limit + 1];
    }

    const res = await this.pool.query(query, params);
    const hasMore = res.rows.length > limit;
    const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
    const nextCursor = hasMore ? rows[rows.length - 1].id : null;

    const messages = rows.reverse().map((r) => ({
      id: r.id,
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      text: r.is_deleted ? 'This message was deleted' : r.text,
      isEdited: r.is_edited,
      editedAt: r.edited_at,
      isDeleted: r.is_deleted,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    }));

    return { messages, nextCursor };
  }

  async updateText(id: string, newText: string, editedAt: Date): Promise<Message | null> {
    const res = await this.pool.query(
      `UPDATE messages
       SET text = $1, is_edited = TRUE, edited_at = $2
       WHERE id = $3 AND is_deleted = FALSE
       RETURNING id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at`,
      [newText, editedAt, id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      text: r.text,
      isEdited: r.is_edited,
      editedAt: r.edited_at,
      isDeleted: r.is_deleted,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  }

  async softDelete(id: string, deletedAt: Date): Promise<Message | null> {
    const res = await this.pool.query(
      `UPDATE messages
       SET is_deleted = TRUE, deleted_at = $1
       WHERE id = $2
       RETURNING id, room_id, user_id, username, text, is_edited, edited_at, is_deleted, deleted_at, created_at`,
      [deletedAt, id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      text: r.text,
      isEdited: r.is_edited,
      editedAt: r.edited_at,
      isDeleted: r.is_deleted,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  }

  async createPrivate(senderId: string, recipientId: string, channel: string, text: string): Promise<void> {
    const id = `pmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await this.pool.query(
      `INSERT INTO private_messages (id, sender_id, recipient_id, channel, text, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, senderId, recipientId, channel, text]
    );
  }
}

export class PgModerationRepository implements IModerationRepository {
  constructor(private pool: Pool) {}

  async recordAction(action: Omit<ModerationAction, 'id' | 'createdAt'>): Promise<ModerationAction> {
    const id = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const res = await this.pool.query(
      `INSERT INTO moderation_actions (id, room_id, actor_id, actor_username, target_id, target_username, action_type, reason, duration_seconds, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id, room_id, actor_id, actor_username, target_id, target_username, action_type, reason, duration_seconds, created_at`,
      [
        id,
        action.roomId,
        action.actorId,
        action.actorUsername,
        action.targetId,
        action.targetUsername,
        action.actionType,
        action.reason || null,
        action.durationSeconds || null,
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      roomId: r.room_id,
      actorId: r.actor_id,
      actorUsername: r.actor_username,
      targetId: r.target_id,
      targetUsername: r.target_username,
      actionType: r.action_type,
      reason: r.reason,
      durationSeconds: r.duration_seconds,
      createdAt: r.created_at,
    };
  }

  async setTimeout(roomId: string, userId: string, expiresAt: Date): Promise<void> {
    const id = `to_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await this.pool.query(
      `INSERT INTO timeouts (id, room_id, user_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [id, roomId, userId, expiresAt]
    );
  }

  async getTimeout(roomId: string, userId: string): Promise<Date | null> {
    const res = await this.pool.query(
      `SELECT expires_at FROM timeouts
       WHERE room_id = $1 AND user_id = $2 AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [roomId, userId]
    );
    return res.rows[0] ? res.rows[0].expires_at : null;
  }

  async removeTimeout(roomId: string, userId: string): Promise<void> {
    await this.pool.query('DELETE FROM timeouts WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  }

  async getLogs(roomId?: string, limit = 50): Promise<ModerationAction[]> {
    const query = roomId
      ? 'SELECT * FROM moderation_actions WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT * FROM moderation_actions ORDER BY created_at DESC LIMIT $1';
    const params = roomId ? [roomId, limit] : [limit];
    const res = await this.pool.query(query, params);
    return res.rows.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      actorId: r.actor_id,
      actorUsername: r.actor_username,
      targetId: r.target_id,
      targetUsername: r.target_username,
      actionType: r.action_type,
      reason: r.reason,
      durationSeconds: r.duration_seconds,
      createdAt: r.created_at,
    }));
  }
}

export class PgAttachmentRepository implements IAttachmentRepository {
  constructor(private pool: Pool) {}

  async create(data: Omit<Attachment, 'createdAt'>): Promise<Attachment> {
    const res = await this.pool.query(
      `INSERT INTO attachments (id, message_id, uploader_id, file_name, mime_type, file_size, storage_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, message_id, uploader_id, file_name, mime_type, file_size, storage_url, created_at`,
      [data.id, data.messageId || null, data.uploaderId, data.fileName, data.mimeType, data.fileSize, data.storageUrl]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      messageId: r.message_id,
      uploaderId: r.uploader_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      fileSize: parseInt(r.file_size, 10),
      storageUrl: r.storage_url,
      createdAt: r.created_at,
    };
  }

  async findById(id: string): Promise<Attachment | null> {
    const res = await this.pool.query('SELECT * FROM attachments WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      messageId: r.message_id,
      uploaderId: r.uploader_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      fileSize: parseInt(r.file_size, 10),
      storageUrl: r.storage_url,
      createdAt: r.created_at,
    };
  }
}
