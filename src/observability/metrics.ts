import client from 'prom-client';

// Collect default metrics (CPU, Memory, Event Loop, GC)
client.collectDefaultMetrics({ prefix: 'connectus_' });

export const httpRequestsTotal = new client.Counter({
  name: 'connectus_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'connectus_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const socketConnectionsActive = new client.Gauge({
  name: 'connectus_socket_connections_active',
  help: 'Number of currently active WebSocket connections',
});

export const socketConnectionsTotal = new client.Counter({
  name: 'connectus_socket_connections_total',
  help: 'Total number of WebSocket connections established',
});

export const socketDisconnectsTotal = new client.Counter({
  name: 'connectus_socket_disconnects_total',
  help: 'Total number of WebSocket disconnections',
});

export const chatMessagesTotal = new client.Counter({
  name: 'connectus_chat_messages_total',
  help: 'Total number of chat messages published',
  labelNames: ['type'], // 'room' | 'private' | 'media'
});

export const moderationJobsTotal = new client.Counter({
  name: 'connectus_moderation_jobs_total',
  help: 'Total moderation jobs dispatched to queue',
  labelNames: ['status'], // 'queued' | 'completed' | 'failed'
});

export const moderationJobDurationSeconds = new client.Histogram({
  name: 'connectus_moderation_job_duration_seconds',
  help: 'Duration of AI moderation jobs in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const register = client.register;
