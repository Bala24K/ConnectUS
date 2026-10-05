import { IModerationRepository } from '../repositories/interfaces';
import { Role, ModerationAction } from '../types/domain';

export class ModerationService {
  private userStrikes = new Map<string, number>();

  constructor(private moderationRepo: IModerationRepository) {}

  canModerate(actorRole: Role, targetRole: Role): boolean {
    if (actorRole === 'admin') return true;
    if (actorRole === 'mod' && targetRole === 'member') return true;
    return false;
  }

  detectOTP(msg: string): boolean {
    return /\b\d{4,8}\b/.test(msg);
  }

  detectTroll(msg: string): boolean {
    const trolls = ['idiot', 'stupid', 'hate', 'trash'];
    const lower = msg.toLowerCase();
    return trolls.some((w) => lower.includes(w));
  }

  extractTopic(msg: string): string | null {
    return msg.toLowerCase().split(' ').find((w) => w.length > 4) || null;
  }

  addStrike(userId: string): number {
    const strikes = (this.userStrikes.get(userId) || 0) + 1;
    this.userStrikes.set(userId, strikes);
    return strikes;
  }

  getStrikes(userId: string): number {
    return this.userStrikes.get(userId) || 0;
  }

  resetStrikes(userId: string): void {
    this.userStrikes.set(userId, 0);
  }

  async setTimeout(
    roomId: string,
    actorId: string,
    actorUsername: string,
    targetId: string,
    targetUsername: string,
    seconds: number
  ): Promise<Date> {
    const expiresAt = new Date(Date.now() + seconds * 1000);
    await this.moderationRepo.setTimeout(roomId, targetId, expiresAt);
    await this.moderationRepo.recordAction({
      roomId,
      actorId,
      actorUsername,
      targetId,
      targetUsername,
      actionType: 'timeout',
      durationSeconds: seconds,
      reason: `Timed out for ${seconds} seconds`,
    });
    return expiresAt;
  }

  async isUserMuted(roomId: string, userId: string): Promise<{ muted: boolean; secondsRemaining: number }> {
    const exp = await this.moderationRepo.getTimeout(roomId, userId);
    if (!exp) return { muted: false, secondsRemaining: 0 };
    const remaining = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 1000));
    if (remaining === 0) {
      await this.moderationRepo.removeTimeout(roomId, userId);
      return { muted: false, secondsRemaining: 0 };
    }
    return { muted: true, secondsRemaining: remaining };
  }

  async recordKick(
    roomId: string,
    actorId: string,
    actorUsername: string,
    targetId: string,
    targetUsername: string,
    reason = 'Kicked by moderator'
  ): Promise<ModerationAction> {
    return this.moderationRepo.recordAction({
      roomId,
      actorId,
      actorUsername,
      targetId,
      targetUsername,
      actionType: 'kick',
      reason,
    });
  }

  async getLogs(roomId?: string, limit = 50): Promise<ModerationAction[]> {
    return this.moderationRepo.getLogs(roomId, limit);
  }
}
