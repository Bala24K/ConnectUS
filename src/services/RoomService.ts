import { v4 as uuidv4 } from 'uuid';
import { IRoomRepository } from '../repositories/interfaces';
import { Room, Role, RoomMember } from '../types/domain';

export class RoomService {
  constructor(private roomRepo: IRoomRepository) {}

  async createOrGetRoom(name: string, creatorUserId: string): Promise<{ room: Room; isNew: boolean }> {
    const cleanName = name.trim();
    let room = await this.roomRepo.findByName(cleanName);
    if (room) {
      return { room, isNew: false };
    }

    room = await this.roomRepo.create({
      id: `rm_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      name: cleanName,
      createdBy: creatorUserId,
    });

    return { room, isNew: true };
  }

  async getRoom(id: string): Promise<Room | null> {
    return this.roomRepo.findById(id);
  }

  async listRooms(): Promise<Room[]> {
    return this.roomRepo.listAll();
  }

  async joinRoom(roomId: string, userId: string, initialRole: Role = 'member'): Promise<Role> {
    const existingRole = await this.roomRepo.getMemberRole(roomId, userId);
    if (existingRole) {
      return existingRole;
    }

    const members = await this.roomRepo.getMembers(roomId);
    const assignedRole = members.length === 0 ? 'admin' : initialRole;

    await this.roomRepo.addMember(roomId, userId, assignedRole);
    return assignedRole;
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.roomRepo.removeMember(roomId, userId);
  }

  async getMembers(roomId: string): Promise<RoomMember[]> {
    return this.roomRepo.getMembers(roomId);
  }

  async getMemberRole(roomId: string, userId: string): Promise<Role> {
    const role = await this.roomRepo.getMemberRole(roomId, userId);
    return role || 'member';
  }

  async updateMemberRole(roomId: string, actorUserId: string, targetUserId: string, newRole: Role): Promise<void> {
    const actorRole = await this.getMemberRole(roomId, actorUserId);
    if (actorRole !== 'admin') {
      throw new Error('Only room admins can promote or demote members');
    }
    await this.roomRepo.updateMemberRole(roomId, targetUserId, newRole);
  }

  async renameRoom(roomId: string, actorUserId: string, newName: string): Promise<Room> {
    const actorRole = await this.getMemberRole(roomId, actorUserId);
    if (actorRole !== 'admin') {
      throw new Error('Only room admins can rename rooms');
    }
    const clean = newName.trim().slice(0, 30);
    if (!clean) throw new Error('Invalid room name');

    const updated = await this.roomRepo.rename(roomId, clean);
    if (!updated) throw new Error('Room not found');
    return updated;
  }
}
