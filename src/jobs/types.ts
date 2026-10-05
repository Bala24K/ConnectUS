export interface ModerationJobData {
  jobId: string;
  roomId: string;
  userId: string;
  socketId: string;
  message: string;
  strikes: number;
}

export interface ModerationJobResult {
  jobId: string;
  roomId: string;
  userId: string;
  socketId: string;
  isHarmful: boolean;
  soothingReply: string;
  strikes: number;
  durationMs: number;
}
