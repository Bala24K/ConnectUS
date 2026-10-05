# ConnectUs / A3webChatApp — Baseline Assessment

**Date:** 2026-10-05  
**Repository:** A3webChatApp  
**Author:** Engineering Team  

---

## 1. How to Run the Current Application

### Prerequisites
- Node.js (verified on v24.13.0)
- npm

### Execution
```bash
# 1. Install dependencies (if not present)
npm install

# 2. Configure environment
# Ensure .env contains:
GEMINI_API_KEY=your_gemini_api_key_here

# 3. Start server
npm start
# or
node server.js
```
The server binds to port `3000` (`http://localhost:3000`).

---

## 2. Current Architecture

```
                  Browser Client (HTML / CSS / Vanilla JS)
                                     │
                             Socket.IO / HTTP
                                     │
                             Express Server
                               (server.js)
                                     │
                       ┌─────────────┴─────────────┐
                       │                           │
              In-Memory Global State           Google Gemini
             (rooms, messages, roles)        (REST fetch API)
```

- **Runtime & Language:** Node.js (CommonJS, `.js`), Express 5.x, Socket.IO 4.x.
- **Entry Point:** Single monolithic [server.js](file:///c:/TernaryAnnum/InTech/src/A3webChatApp/server.js) (311 lines).
- **Client:** Static frontend files served from `public/` ([index.html](file:///c:/TernaryAnnum/InTech/src/A3webChatApp/public/index.html), [client.js](file:///c:/TernaryAnnum/InTech/src/A3webChatApp/public/client.js), [style.css](file:///c:/TernaryAnnum/InTech/src/A3webChatApp/public/style.css)).
- **State Management:** Fully in-memory JavaScript objects (`rooms`, `roomRoles`, `roomMessages`, `roomNames`, `userStrikes`, `mutedUsers`, `blockedTopics`).
- **Persistence:** None. Server restart erases all rooms, messages, roles, and strikes.
- **AI Moderation:** Synchronous blocking `fetch` to Google Gemini (`gemini-flash-latest`) inside the socket message handler.

---

## 3. Current User-Visible Features Checklist

| Feature | Status | Notes |
|---|---|---|
| User join / login | Working | Simple client-provided username and room name, no credentials or authentication |
| Room assignment | Working | First user in room gets `admin` role, subsequent get `member` |
| Real-time messaging | Working | Socket.IO `chatMessage`, broadcast to room with timestamp & generated ID |
| Message editing | Working | Author can edit existing messages; broadcasts `messageEdited` |
| Message deletion | Working | Author, Admin, or Moderator can delete; broadcasts `messageDeleted` |
| Media attachments | Working | Base64 file reader via Socket.IO (`mediaMessage`), 50MB payload limit |
| Private messaging | Working | Ephemeral 1-on-1 rooms (`private_<id1>_<id2>`), private typing & media |
| Typing indicators | Working | `typing` / `stopTyping` broadcasts with debounce |
| Role hierarchy | Working | `admin` > `mod` > `member`. Admin can promote/demote |
| Moderation actions | Working | Kick, mute/timeout (10–600s), strike counter |
| In-line filters | Working | OTP regex pattern detection (`detectOTP`) warns user |
| AI Moderation | Working | `detectTroll` keywords trigger Gemini API for soothing reply & strike escalation |
| Room rename | Working | Admin can rename room; updates badge & header |

---

## 4. Current Limitations & Architectural Deficits

1. **Zero Data Persistence:** All messages, room history, and member roles are lost immediately upon process restart or crash.
2. **No Real Authentication or Identity Security:** Users specify arbitrary usernames with zero password verification or JWT validation. Sockets trust client-supplied identity.
3. **Monolithic In-Memory State:** Impossible to scale horizontally. Two Node instances would not share rooms, active users, or broadcasts.
4. **Blocking AI Execution:** Gemini API calls are awaited directly inside the socket event loop, creating head-of-line blocking under load or network latency.
5. **Base64 Over-The-Wire Media Transport:** Large 50MB Base64 strings are transported directly through WebSocket frames and JSON payloads, exhausting memory and socket buffers.
6. **No Type Safety:** Untyped JavaScript throughout the backend, prone to runtime errors on missing fields or null dereferences.
7. **No Automated Test Suite:** Zero unit tests, zero integration tests, zero contract tests.
8. **Lack of Observability:** No structured logging (uses `console.log`), no metrics collector (Prometheus), no health/readiness probes.
9. **No Containerization or CI/CD:** No Dockerfile, docker-compose, or automated GitHub Actions pipeline.

---

## 5. Current Socket Events & Data Contracts

### Client to Server Events
- `joinRoom`: `{ username: string, room: string }`
- `chatMessage`: `string`
- `chatMessageConfirmed`: `string`
- `mediaMessage`: `{ data: string (base64), type: string }`
- `editMessage`: `{ msgId: string, newText: string }`
- `deleteMessage`: `{ msgId: string }`
- `promoteUser`: `{ targetId: string }`
- `demoteUser`: `{ targetId: string }`
- `kickUser`: `{ targetId: string }`
- `timeoutUser`: `{ targetId: string, duration: number }`
- `changeRoomName`: `{ newName: string }`
- `startPrivate`: `{ targetId: string }`
- `privateChatMessage`: `{ room: string, message: string }`
- `privateMediaMessage`: `{ room: string, data: string, type: string }`
- `leavePrivate`: `{ room: string }`
- `typing`: `void`
- `stopTyping`: `void`
- `privateTyping`: `{ room: string }`
- `privateStopTyping`: `{ room: string }`

### Server to Client Broadcasts
- `message`: `{ user: string, text: string, id: string, msgId: string }`
- `system`: `string`
- `mediaMessage`: `{ user: string, data: string, type: string }`
- `myRole`: `{ role: "admin" | "mod" | "member" }`
- `roleChanged`: `{ role: "admin" | "mod" | "member" }`
- `roomUsers`: `Array<{ id: string, username: string, role: string }>`
- `userTyping`: `{ username: string, id: string }`
- `userStopTyping`: `{ id: string }`
- `messageEdited`: `{ msgId: string, newText: string, editedAt: string }`
- `messageDeleted`: `{ msgId: string, deletedAt: string }`
- `roomRenamed`: `{ newName: string }`
- `kicked`: `{ by: string }`
- `muted`: `number` (seconds remaining)
- `otpWarning`: `void`
- `userDisconnected`: `string` (socket id)
- `privateStarted`: `{ room: string }`
- `privateMessage`: `{ user: string, text: string }`
- `privateMediaMessage`: `{ user: string, data: string, type: string }`
- `privateUserTyping`: `{ username: string }`
- `privateUserStopTyping`: `void`
- `partnerLeft`: `{ username: string }`

---

## 6. Migration Risks & Compatibility Strategy

1. **Client Compatibility:** The existing web frontend relies strictly on the socket event names and structures listed above. The backend migration must preserve these exact contracts or provide seamless adapter translation.
2. **Anonymous vs Authenticated Users:** To maintain instant browser usability, the upgraded system will support both registered users (with JWT & RBAC) and guest/anonymous sessions with fallback authentication tokens.
3. **Database & Redis Availability:** For developers running locally without active PostgreSQL or Redis services, the system will offer graceful fallback modes (in-memory repository & queue fallback) while providing a turnkey Docker Compose file for full production infrastructure.
