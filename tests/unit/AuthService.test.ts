import { AuthService } from '../../src/services/AuthService';
import { MemoryUserRepository } from '../../src/repositories/memory';

describe('AuthService', () => {
  let userRepo: MemoryUserRepository;
  let authService: AuthService;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    authService = new AuthService(userRepo);
  });

  it('should register a new user with hashed password and return token', async () => {
    const result = await authService.register('alice', 'password123', 'member');
    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('alice');
    expect(result.user.role).toBe('member');
    expect(result.user.isGuest).toBe(false);

    const savedUser = await userRepo.findByUsername('alice');
    expect(savedUser).not.toBeNull();
    expect(savedUser?.passwordHash).toBeDefined();
    expect(savedUser?.passwordHash).not.toBe('password123'); // Hashed
  });

  it('should fail to register if registered username exists', async () => {
    await authService.register('alice', 'password123');
    await expect(authService.register('alice', 'differentPassword')).rejects.toThrow(
      'Username already exists'
    );
  });

  it('should login an existing user with valid password', async () => {
    await authService.register('bob', 'secretPass');
    const result = await authService.login('bob', 'secretPass');
    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('bob');
  });

  it('should fail login with invalid password', async () => {
    await authService.register('bob', 'secretPass');
    await expect(authService.login('bob', 'wrongPassword')).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('should create guest session for quick anonymous access', async () => {
    const result = await authService.createGuestSession('guest_user');
    expect(result.token).toBeDefined();
    expect(result.user.isGuest).toBe(true);

    const decoded = authService.verifyToken(result.token);
    expect(decoded.username).toBe('guest_user');
    expect(decoded.isGuest).toBe(true);
  });
});
