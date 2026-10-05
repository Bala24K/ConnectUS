# ConnectUs — Real-Time Event-Driven Collaboration Platform

[![ConnectUs CI](https://github.com/TernaryAnnum/A3webChatApp/actions/workflows/ci.yml/badge.svg)](https://github.com/TernaryAnnum/A3webChatApp/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Distributed](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)
[![Observability](https://img.shields.io/badge/Prometheus%20%2B%20Grafana-Enabled-orange.svg)](https://prometheus.io/)

**ConnectUs** is a production-grade, event-driven real-time collaboration backend built with **Node.js, TypeScript, Express, Socket.IO, PostgreSQL, Redis, BullMQ, Prometheus, and Grafana**.

Evolved from a monolithic in-memory chat prototype, ConnectUs preserves 100% of the original user-facing real-time chat, moderation, and AI features while upgrading the backend into an observable, scalable, testable, and enterprise-grade modular monolith.

---

## 1. System Architecture

```
                              CLIENT TIER
                       ┌─────────────────────────┐
                       │  Web Client (Browser)   │
                       └────────────┬────────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                  REST API (HTTP)           WebSocket (Socket.IO)
                       │                         │
                       └────────────┬────────────┘
                                    ▼
                          APPLICATION TIER
                       ┌─────────────────────────┐
                       │  Node.js + TypeScript   │
                       │    Modular Monolith     │
                       └────────────┬────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
      Auth & RBAC Service      Chat Service          Moderation Service
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                                    ▼
                         DATA & DISTRIBUTED TIER
            ┌───────────────────────┬───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
      PostgreSQL 16              Redis 7                 BullMQ
   (Durable Relational)     (Pub/Sub, Cluster,     (Background Queue)
     - users                  Presence)                     │
     - rooms                                                ▼
     - room_members                                 Moderation Worker
     - messages                                             │
     - moderation_actions                                   ▼
     - timeouts                                       Google Gemini
     - attachments                                    (AI Analysis)
            │                       │
            └───────────┬───────────┘
                        ▼
                OBSERVABILITY TIER
            ┌───────────────────────┐
            │  Prometheus Scraper   │
            │     (/metrics)        │
            └───────────┬───────────┘
                        ▼
            ┌───────────────────────┐
            │   Grafana Dashboard   │
            │     (Port 3001)       │
            └───────────────────────┘
```

---

## 2. Key Capabilities & Engineering Upgrades

| Domain | Original Prototype | ConnectUs Production Architecture |
|---|---|---|
| **Language & Typing** | Plain CommonJS JavaScript | Strict TypeScript 5.8 with full domain models and typed Socket.IO contracts |
| **Persistence** | Volatile in-memory JavaScript objects | PostgreSQL 16 relational storage with composite indexes and transactions |
| **Pagination** | None (client keeps appending) | Keyset cursor-based pagination (`/api/rooms/:id/messages?before=...`) |
| **Authentication** | Unauthenticated arbitrary usernames | Argon2/bcrypt password hashing, signed JWT tokens, guest token fallback |
| **Authorization** | Ad-hoc client/server checks | Centralized RBAC (`admin` > `mod` > `member`) on REST and WebSocket events |
| **AI Moderation** | Blocking inline `fetch` on socket loop | Asynchronous BullMQ background worker with exponential backoff & Gemini provider abstraction |
| **Media Handling** | 50MB Base64 transferred in memory | Decoupled storage service with attachment tracking |
| **Clustering** | Single process only | Horizontal scalability supported via `@socket.io/redis-adapter` |
| **Observability** | `console.log` | Structured JSON logging (Pino), Prometheus metrics, and automated Grafana dashboards |
| **Testing** | 0 tests | 30 automated Jest tests (Unit, REST API Supertest, Socket.IO client tests) |
| **Containerization** | None | Multi-stage Dockerfile & multi-container Docker Compose |
| **CI/CD** | None | Automated GitHub Actions workflow (lint, typecheck, test, compile) |

---

## 3. Directory Layout

```
.
├── .github/workflows/ci.yml       # GitHub Actions CI pipeline
├── deploy/
│   ├── prometheus/                # Prometheus scraper configuration
│   └── grafana/                   # Auto-provisioned datasources & dashboards
├── docs/
│   ├── architecture.md            # Comprehensive Architecture Decision Records (ADRs)
│   └── api.md                     # REST API & Socket.IO Event Specification
├── public/                        # Browser client UI (HTML, CSS, Vanilla JS)
│   ├── index.html
│   ├── client.js
│   └── style.css
├── src/
│   ├── app.ts                     # Express setup, middleware, REST routes
│   ├── server.ts                  # Server entry point, Socket.IO, Redis adapter
│   ├── worker.ts                  # Standalone queue worker process
│   ├── config/                    # Validated environment configuration
│   ├── database/                  # PostgreSQL pool and migration scripts
│   ├── types/                     # Domain, Auth, and Socket type definitions
│   ├── observability/             # Structured Pino logger & Prometheus metrics
│   ├── repositories/              # Repository interfaces, PG & Memory implementations
│   ├── services/                  # AuthService, RoomService, MessageService, ModerationService
│   ├── moderation/                # AI moderation providers (Gemini & Mock)
│   ├── jobs/                      # BullMQ queue & background worker
│   ├── middleware/                # JWT auth, RBAC, correlation ID, rate limiters
│   ├── routes/                    # REST API routes (auth, rooms, media, moderation, health)
│   └── socket/                    # Modular Socket.IO handlers
├── tests/
│   ├── unit/                      # Service unit tests
│   └── integration/               # REST API & Socket.IO integration tests
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Full infrastructure stack
├── BASELINE.md                    # Initial prototype assessment
├── package.json
└── tsconfig.json
```

---

## 4. Quickstart Guide

### Option A: Local Development (Zero Infrastructure Dependency)
ConnectUs includes an automatic in-memory fallback layer, allowing you to run the platform immediately with Node.js without needing local PostgreSQL or Redis:

```powershell
# 1. Install dependencies
npm install

# 2. Build TypeScript artifacts
npm run build

# 3. Start development server with live reload
npm run dev

# 4. Open in browser
# http://localhost:3000
```

### Option B: Turnkey Production Stack (Docker Compose)
Run the entire platform including Node.js backend, worker process, PostgreSQL, Redis, Prometheus, and Grafana with a single command:

```bash
# 1. Provide your Google Gemini API key (optional, falls back to Mock provider if blank)
export GEMINI_API_KEY="your-gemini-key"

# 2. Launch all services
docker compose up --build -d

# 3. Verify services
docker compose ps
```

#### Service URLs
- **Web Chat Application:** [http://localhost:3000](http://localhost:3000)
- **Prometheus Metrics:** [http://localhost:9090](http://localhost:9090)
- **Grafana Dashboard:** [http://localhost:3001](http://localhost:3001) *(login: `admin` / `admin`)*
- **Liveness Probe:** [http://localhost:3000/health](http://localhost:3000/health)
- **Readiness Probe:** [http://localhost:3000/ready](http://localhost:3000/ready)

---

## 5. Running the Test Suite

```powershell
# Run all unit and integration tests
npm test

# Run tests with code coverage report
npm run test:coverage

# Perform static type checking
npm run typecheck
```

---

## 6. Real-Time Chat & Moderation Architecture

1. **Client Dispatches Message:** Browser client emits `chatMessage` over WebSocket.
2. **Synchronous Validation:** Server verifies sender authentication, muting status, and checks sensitive numbers (OTP regex).
3. **Keyword Toxicity Detection:** If toxic keywords are detected:
   - Increments strike counter in user record.
   - Enqueues an asynchronous moderation job to BullMQ (`moderation-queue`).
   - The main WebSocket event loop **remains non-blocking** and continues processing messages for all other users.
4. **Worker AI Processing:** BullMQ worker retrieves the job, calls Google Gemini (`gemini-1.5-flash`), generates an empathetic de-escalation response, records metrics, and updates PostgreSQL.
5. **Real-Time Notification:** Socket server emits an AI moderation de-escalation reply to the offending user, applying progressive penalties (60s mute on 2nd strike, disconnection on 4th strike).

---

## 7. Failure Handling & Resilience Matrix

| Failure Scenario | System Behavior | Recovery Strategy |
|---|---|---|
| **PostgreSQL Unreachable** | System logs a warning and automatically switches to the in-memory repository store. | `/ready` probe flags database as disconnected; reconnect attempts continue in background. |
| **Redis Unreachable** | System switches to an in-memory event bus and local Socket.IO adapter. | Background tasks process in-process; retries resume when Redis is available. |
| **Gemini API Timeout / Rate Limit** | Worker handles timeout after 8000ms with exponential backoff retries (3 attempts). | If quota is exhausted, falls back to deterministic soothing template without breaking chat. |
| **Client Disconnect** | Socket disconnect handler broadcasts user departure, updates room count, and closes private 1-on-1 rooms. | State is cleaned up immediately; peers receive `partnerLeft` event. |
| **Duplicate Message Delivery** | Unique message IDs and database idempotency constraints prevent duplicate storage. | Client receives confirmation without duplicate UI rendering. |

---

## 8. Documentation References
- [Architecture Decision Records (ADRs)](docs/architecture.md)
- [API & WebSocket Specification](docs/api.md)
- [Baseline Assessment](BASELINE.md)
