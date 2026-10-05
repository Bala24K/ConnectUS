export interface ModerationResult {
  isHarmful: boolean;
  soothingReply: string;
  provider: string;
  durationMs: number;
}

export interface IModerationProvider {
  name: string;
  generateSoothingReply(message: string): Promise<ModerationResult>;
}
