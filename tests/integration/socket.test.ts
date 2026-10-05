import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/socket';
import { initializeRepositories } from '../../src/repositories/factory';

describe('ConnectUs Socket.IO Integration Tests', () => {
  let server: http.Server;
  let ioServer: SocketIOServer;
  let client1: ClientSocket;
  let client2: ClientSocket;
  let serverPort: number;

  beforeAll((done) => {
    initializeRepositories(true);
    const app = createApp();
    server = http.createServer(app);
    ioServer = new SocketIOServer(server);
    initializeSocketServer(ioServer);

    server.listen(0, () => {
      const addr = server.address() as any;
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    if (client1?.connected) client1.disconnect();
    if (client2?.connected) client2.disconnect();
    ioServer.close();
    server.close(done);
  });

  it('should connect to WebSocket and join room', (done) => {
    client1 = ClientIO(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { username: 'alice' },
    });

    client1.on('connect', () => {
      client1.emit('joinRoom', { username: 'alice', room: 'testing-room' });
    });

    client1.on('myRole', (data) => {
      expect(['admin', 'member']).toContain(data.role);
      done();
    });
  });

  it('should broadcast chat message across clients in the same room', (done) => {
    client2 = ClientIO(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      auth: { username: 'bob' },
    });

    client2.on('connect', () => {
      client2.emit('joinRoom', { username: 'bob', room: 'testing-room' });

      // Alice sends a message
      client1.emit('chatMessage', 'Hello everyone in testing-room!');
    });

    client2.on('message', (msg) => {
      if (msg.text === 'Hello everyone in testing-room!') {
        expect(msg.user).toBe('alice');
        expect(msg.msgId).toBeDefined();
        done();
      }
    });
  });

  it('should broadcast typing indicator', (done) => {
    client2.on('userTyping', (data) => {
      if (data.username === 'alice') {
        expect(data.username).toBe('alice');
        done();
      }
    });

    client1.emit('typing');
  });
});
