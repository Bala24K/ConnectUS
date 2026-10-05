import { RoomService } from '../../src/services/RoomService';
import { MemoryRoomRepository } from '../../src/repositories/memory';

describe('RoomService', () => {
  let roomRepo: MemoryRoomRepository;
  let roomService: RoomService;

  beforeEach(() => {
    roomRepo = new MemoryRoomRepository();
    roomService = new RoomService(roomRepo);
  });

  it('should create a new room and return isNew = true', async () => {
    const { room, isNew } = await roomService.createOrGetRoom('engineering', 'user1');
    expect(isNew).toBe(true);
    expect(room.name).toBe('engineering');
  });

  it('should return existing room if already created', async () => {
    await roomService.createOrGetRoom('engineering', 'user1');
    const { room, isNew } = await roomService.createOrGetRoom('engineering', 'user2');
    expect(isNew).toBe(false);
    expect(room.name).toBe('engineering');
  });

  it('should assign admin to the first member joining the room', async () => {
    const { room } = await roomService.createOrGetRoom('devs', 'user1');
    const role1 = await roomService.joinRoom(room.id, 'user1');
    expect(role1).toBe('admin');

    const role2 = await roomService.joinRoom(room.id, 'user2', 'member');
    expect(role2).toBe('member');
  });

  it('should allow admin to rename room', async () => {
    const { room } = await roomService.createOrGetRoom('general', 'admin1');
    await roomService.joinRoom(room.id, 'admin1', 'admin');

    const updated = await roomService.renameRoom(room.id, 'admin1', 'announcements');
    expect(updated.name).toBe('announcements');
  });

  it('should prevent non-admin from renaming room', async () => {
    const { room } = await roomService.createOrGetRoom('general', 'admin1');
    await roomService.joinRoom(room.id, 'admin1', 'admin');
    await roomService.joinRoom(room.id, 'member1', 'member');

    await expect(roomService.renameRoom(room.id, 'member1', 'hacked')).rejects.toThrow(
      'Only room admins can rename rooms'
    );
  });
});
