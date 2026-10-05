import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { IUserRepository } from '../repositories/interfaces';
import { User, Role } from '../types/domain';
import { JWTPayload, AuthResult } from '../types/auth';
import { config } from '../config';

export class AuthService {
  constructor(private userRepo: IUserRepository) {}

  async register(username: string, password?: string, role: Role = 'member'): Promise<AuthResult> {
    const existing = await this.userRepo.findByUsername(username);
    if (existing && !existing.isGuest) {
      throw new Error('Username already exists');
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
    const user = await this.userRepo.create({
      id: existing ? existing.id : `usr_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      username,
      passwordHash,
      role,
      isGuest: !password,
    });

    const token = this.generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isGuest: !!user.isGuest,
      },
    };
  }

  async login(username: string, password?: string): Promise<AuthResult> {
    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.passwordHash && password) {
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) throw new Error('Invalid credentials');
    } else if (user.passwordHash && !password) {
      throw new Error('Password required for registered account');
    }

    const token = this.generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isGuest: !!user.isGuest,
      },
    };
  }

  async createGuestSession(username: string): Promise<AuthResult> {
    let user = await this.userRepo.findByUsername(username);
    if (!user) {
      user = await this.userRepo.create({
        id: `gst_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        username,
        role: 'member',
        isGuest: true,
      });
    }

    const token = this.generateToken(user);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isGuest: true,
      },
    };
  }

  generateToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      isGuest: user.isGuest,
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry as any });
  }

  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  }
}
