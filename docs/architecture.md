# ConnectUs Platform — Architecture & Engineering Design Decisions (ADRs)

**System:** ConnectUs — Real-Time Event-Driven Collaboration Platform  
**Architecture Pattern:** Event-Driven Modular Monolith  
**Tech Stack:** Node.js, TypeScript, Express, Socket.IO, PostgreSQL, Redis, BullMQ, Prometheus, Grafana, Docker  

---

## Architecture Diagram

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

## Architectural Decision Records (ADRs)

### 1. Runtime & Language: Node.js + TypeScript
- **Decision:** Migrate from untyped JavaScript to TypeScript on Node.js.
- **Reason:** Real-time event systems involve complex asynchronous payload contracts across WebSockets and REST. Strict typing eliminates runtime null-pointer bugs, enables auto-completion, and formalizes domain entities.
- **Alternative:** Go or Java. Node.js is retained because it preserves the rich existing Socket.IO ecosystem and full backward compatibility.
- **Trade-off:** Requires a compilation step (`tsc`) and type definitions.
- **Status:** Adopted and verified in production build.

### 2. Architecture Style: Modular Monolith vs Microservices
- **Decision:** Build a single cohesive modular monolith with clean domain boundaries (`src/services`, `src/repositories`, `src/routes`, `src/socket`).
- **Reason:** Microservices introduce network latency, distributed transaction complexity, deployment overhead, and serialization costs without immediate necessity. A modular monolith provides clean testability, zero-network in-process communication, and simple single-container deployment.
- **Alternative:** Distributed microservices (e.g. auth-service, chat-service, moderation-service).
- **Trade-off:** All domains scale together unless workers are broken out into separate worker processes (which our architecture supports via `src/worker.ts`).
- **Status:** Adopted.

### 3. Real-Time Protocol: Socket.IO with Fallback
- **Decision:** Retain Socket.IO with strongly typed event interfaces (`ServerToClientEvents`, `ClientToServerEvents`).
- **Reason:** Provides automatic reconnection, room abstraction, binary media transport, heartbeat detection, and seamless multi-instance clustering via `@socket.io/redis-adapter`.
- **Alternative:** Raw WebSockets (`ws`).
- **Trade-off:** Slight protocol wrapper overhead compared to pure WebSocket frames.
- **Status:** Adopted.

### 4. Database: PostgreSQL instead of MongoDB
- **Decision:** Use PostgreSQL 16 as the authoritative persistent datastore.
- **Reason:** Chat collaboration platforms require strict relational integrity (Users <-> Rooms <-> Memberships <-> Roles <-> Messages <-> Moderation Actions). Relational foreign keys and composite indexes (`(room_id, created_at DESC)`) guarantee atomicity, referential integrity, and efficient cursor-based pagination.
- **Alternative:** MongoDB.
- **Trade-off:** Requires formal schema migrations instead of dynamic schemaless JSON.
- **Status:** Adopted with parameterized SQL, composite indexes, and in-memory test fallback.

### 5. Message History Retrieval: Cursor-Based Pagination
- **Decision:** Implement cursor pagination using `(room_id, created_at DESC)` and `before=<message_id>`.
- **Reason:** Traditional `OFFSET` pagination degrades to $O(N)$ scanning on large message volumes and causes skipped/duplicated messages when new chat messages arrive concurrently. Keyset cursor pagination runs in $O(1)$ indexed lookup time.
- **Alternative:** Offset/Limit pagination (`OFFSET 5000 LIMIT 50`).
- **Trade-off:** Users cannot jump directly to arbitrary page numbers (e.g., page 42), which is rarely desired in real-time chat feeds anyway.
- **Status:** Implemented in `MessageRepository` and `/api/rooms/:roomId/messages`.

### 6. Distributed Coordination & Queues: Redis + BullMQ
- **Decision:** Use Redis for distributed Socket.IO adapter pub/sub, rate limiting, and BullMQ background queue.
- **Reason:** AI moderation (calling Google Gemini) takes between 500ms and 5000ms. Running AI inference inside the socket event loop blocks real-time delivery and exhausts socket buffers. BullMQ decouples message ingestion from AI moderation, providing exponential backoff, retry policies, and dead-letter safety.
- **Alternative:** RabbitMQ or Kafka. Redis + BullMQ provides minimal operational footprint and native Node.js event integration.
- **Trade-off:** Redis must be maintained in production (handled via container or managed Redis service).
- **Status:** Adopted with graceful in-memory queue fallback for offline dev.

### 7. AI Moderation Abstraction: Provider Pattern
- **Decision:** Hide LLM moderation behind `IModerationProvider` interface (`GeminiModerationProvider` and `MockModerationProvider`).
- **Reason:** Prevents vendor lock-in, shields the core message pipeline from LLM network flakiness, and enables instant deterministic unit testing.
- **Alternative:** Direct inline Gemini `fetch` calls.
- **Trade-off:** Additional abstraction layer.
- **Status:** Adopted.

### 8. Observability: Prometheus & Grafana
- **Decision:** Instrument application with `prom-client` exposing `/metrics` and provision pre-configured Grafana dashboards.
- **Reason:** Real-time collaboration systems require visibility into WebSocket connection concurrency, message throughput, HTTP latency histograms (p95/p99), and queue backlog depth.
- **Alternative:** Ad-hoc console logging.
- **Trade-off:** Minor CPU/memory overhead for metrics collection.
- **Status:** Implemented with automated Docker Compose provisioning.
