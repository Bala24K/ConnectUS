import { Role } from './domain';

export interface ServerToClientEvents {
  message: (data: { user: string; text: string; id: string; msgId: string }) => void;
  system: (msg: string, container?: string) => void;
  mediaMessage: (data: { user: string; data: string; type: string }) => void;
  myRole: (data: { role: Role }) => void;
  roleChanged: (data: { role: Role }) => void;
  roomUsers: (users: Array<{ id: string; username: string; role: Role }>) => void;
  userTyping: (data: { username: string; id: string }) => void;
  userStopTyping: (data: { id: string }) => void;
  messageEdited: (data: { msgId: string; newText: string; editedAt: string }) => void;
  messageDeleted: (data: { msgId: string; deletedAt: string }) => void;
  roomRenamed: (data: { newName: string }) => void;
  kicked: (data: { by: string }) => void;
  muted: (seconds: number) => void;
  otpWarning: () => void;
  userDisconnected: (socketId: string) => void;
  privateStarted: (data: { room: string }) => void;
  privateMessage: (data: { user: string; text: string }) => void;
  privateMediaMessage: (data: { user: string; data: string; type: string }) => void;
  privateUserTyping: (data: { username: string }) => void;
  privateUserStopTyping: () => void;
  partnerLeft: (data: { username: string }) => void;
}

export interface ClientToServerEvents {
  joinRoom: (data: { username: string; room: string }) => void;
  chatMessage: (message: string) => void;
  chatMessageConfirmed: (message: string) => void;
  mediaMessage: (data: { data: string; type: string }) => void;
  editMessage: (data: { msgId: string; newText: string }) => void;
  deleteMessage: (data: { msgId: string }) => void;
  promoteUser: (data: { targetId: string }) => void;
  demoteUser: (data: { targetId: string }) => void;
  kickUser: (data: { targetId: string }) => void;
  timeoutUser: (data: { targetId: string; duration: number | string }) => void;
  changeRoomName: (data: { newName: string }) => void;
  startPrivate: (data: { targetId: string }) => void;
  privateChatMessage: (data: { room: string; message: string }) => void;
  privateMediaMessage: (data: { room: string; data: string; type: string }) => void;
  leavePrivate: (data: { room: string }) => void;
  typing: () => void;
  stopTyping: () => void;
  privateTyping: (data: { room: string }) => void;
  privateStopTyping: (data: { room: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
  room?: string;
  role?: Role;
  isGuest?: boolean;
}
