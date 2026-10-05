import { MessageService } from '../../src/services/MessageService';
import { MemoryMessageRepository, MemoryRoomRepository } from '../../src/repositories/memory';

describe('MessageService', () => {
  let messageRepo: MemoryMessageRepository;
  let roomRepo: MemoryRoomRepository;
  let messageService: MessageService;

  beforeEach(() => {
    messageRepo = new MemoryMessageRepository();
    roomRepo = new MemoryRoomRepository();
    messageService = new MessageService(messageRepo, roomRepo);
  });

  it('should create and retrieve messages with cursor pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      await messageService.createMessage('room1', 'user1', 'alice', `Message ${i}`);
    }

    const page1 = await messageService.getMessages('room1', 3);
    expect(page1.messages.length).toBe(3);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await messageService.getMessages('room1', 3, page1.nextCursor!);
    expect(page2.messages.length).toBe(2);
  });

  it('should allow author to edit their own message', async () => {
    const msg = await messageService.createMessage('room1', 'user1', 'alice', 'Original text');
    const edited = await messageService.editMessage(msg.id, 'user1', 'Updated text');

    expect(edited.text).toBe('Updated text');
    expect(edited.isEdited).toBe(true);
    expect(edited.editedAt).toBeDefined();
  });

  it('should prevent non-authors from editing a message', async () => {
    const msg = await messageService.createMessage('room1', 'user1', 'alice', 'Original text');
    await expect(messageService.editMessage(msg.id, 'user2', 'Hacked text')).rejects.toThrow(
      'Unauthorized to edit this message'
    );
  });

  it('should allow author or moderator to soft delete message', async () => {
    const msg = await messageService.createMessage('room1', 'user1', 'alice', 'Bad message');
    const result = await messageService.deleteMessage(msg.id, 'room1', 'mod1', 'admin');

    expect(result.message.isDeleted).toBe(true);
    expect(result.deletedBy).toBe('moderator');
  });
});
