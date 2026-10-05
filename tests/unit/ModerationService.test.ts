import { ModerationService } from '../../src/services/ModerationService';
import { MemoryModerationRepository } from '../../src/repositories/memory';

describe('ModerationService', () => {
  let modRepo: MemoryModerationRepository;
  let modService: ModerationService;

  beforeEach(() => {
    modRepo = new MemoryModerationRepository();
    modService = new ModerationService(modRepo);
  });

  it('should verify RBAC moderation matrix correctly', () => {
    expect(modService.canModerate('admin', 'mod')).toBe(true);
    expect(modService.canModerate('admin', 'member')).toBe(true);
    expect(modService.canModerate('mod', 'member')).toBe(true);
    expect(modService.canModerate('mod', 'admin')).toBe(false);
    expect(modService.canModerate('mod', 'mod')).toBe(false);
    expect(modService.canModerate('member', 'member')).toBe(false);
  });

  it('should detect OTP numbers in text', () => {
    expect(modService.detectOTP('Your verification code is 4829')).toBe(true);
    expect(modService.detectOTP('Hello world, no numbers here')).toBe(false);
  });

  it('should detect troll keywords', () => {
    expect(modService.detectTroll('You are an idiot')).toBe(true);
    expect(modService.detectTroll('This chat is so helpful')).toBe(false);
  });

  it('should track user strikes and timeouts', async () => {
    expect(modService.addStrike('user1')).toBe(1);
    expect(modService.addStrike('user1')).toBe(2);
    expect(modService.getStrikes('user1')).toBe(2);

    await modService.setTimeout('room1', 'admin1', 'Admin', 'user1', 'User 1', 30);
    const muteStatus = await modService.isUserMuted('room1', 'user1');
    expect(muteStatus.muted).toBe(true);
    expect(muteStatus.secondsRemaining).toBeGreaterThan(0);
  });
});
