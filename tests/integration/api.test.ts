import request from 'supertest';
import { createApp } from '../../src/app';
import { initializeRepositories } from '../../src/repositories/factory';

describe('ConnectUs REST API Integration Tests', () => {
  const app = createApp();

  beforeAll(() => {
    initializeRepositories(true); // Force in-memory for testing
  });

  describe('Observability & Probes', () => {
    it('GET /health should return 200 and healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('GET /ready should return readiness checks', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('GET /metrics should expose Prometheus text metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('connectus_http_requests_total');
    });
  });

  describe('Authentication & User Lifecycle', () => {
    let authToken = '';

    it('POST /api/auth/register should create a user and return JWT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'tester1', password: 'securePassword123' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('tester1');
      authToken = res.body.token;
    });

    it('POST /api/auth/login should authenticate user with credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'tester1', password: 'securePassword123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('GET /api/auth/me should return authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('tester1');
    });

    it('POST /api/auth/guest should provide quick guest token', async () => {
      const res = await request(app)
        .post('/api/auth/guest')
        .send({ username: 'guest_observer' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.isGuest).toBe(true);
    });
  });

  describe('Room Lifecycle & Message Pagination', () => {
    let token = '';

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'roomAdmin', password: 'password123', role: 'admin' });
      token = res.body.token;
    });

    it('POST /api/rooms should create a room', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Architecture' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.room.name).toBe('Architecture');
    });

    it('GET /api/rooms should list all active rooms', async () => {
      const res = await request(app).get('/api/rooms');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rooms)).toBe(true);
    });
  });
});
