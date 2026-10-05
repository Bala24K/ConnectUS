import { Role } from './domain';

export interface JWTPayload {
  userId: string;
  username: string;
  role: Role;
  isGuest?: boolean;
  iat?: number;
  exp?: number;
}

export interface UserRegistrationDto {
  username: string;
  password?: string;
  role?: Role;
}

export interface UserLoginDto {
  username: string;
  password?: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    role: Role;
    isGuest: boolean;
  };
}
