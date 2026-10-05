# ConnectUs Platform — API & WebSocket Event Specification

---

## 1. REST API Reference

### Base URL: `http://localhost:3000`

### Authentication Endpoints

#### `POST /api/auth/register`
Creates a new user account with bcrypt password hashing.
- **Request Body:**
  ```json
  {
    "username": "jane_doe",
    "password": "strongPassword123",
    "role": "member" // optional: 'admin' | 'mod' | 'member' (default: 'member')
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": "usr_9d8e7f...",
      "username": "jane_doe",
      "role": "member",
      "isGuest": false
    }
  }
  ```

#### `POST /api/auth/login`
Authenticates an existing user and returns a signed JWT.
- **Request Body:**
  ```json
  {
    "username": "jane_doe",
    "password": "strongPassword123"
  }
  ```
- **Response `200 OK`:** Same schema as register.

#### `POST /api/auth/guest`
Generates an ephemeral guest session for instant browser access without credentials.
- **Request Body:**
  ```json
  { "username": "guest_explorer" }
  ```
- **Response `200 OK`:** JWT token with `isGuest: true`.

#### `GET /api/auth/me`
Returns current authenticated user details from the JWT.
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`:**
  ```json
  {
    "user": {
      "userId": "usr_9d8e7f...",
      "username": "jane_doe",
      "role": "member",
      "isGuest": false
    }
  }
  ```

---

### Room & Message Endpoints

#### `GET /api/rooms`
Lists all active discussion rooms.
- **Response `200 OK`:**
  ```json
  {
    "rooms": [
      {
        "id": "rm_c7a10f...",
        "name": "General",
        "createdBy": "usr_...",
        "createdAt": "2026-10-05T14:00:00Z"
      }
    ]
  }
  ```

#### `POST /api/rooms`
Creates a new room or joins an existing one. Creator automatically becomes `admin`.
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  { "name": "Engineering" }
  ```
- **Response `201 Created`:**
  ```json
  {
    "room": { "id": "rm_...", "name": "Engineering", "createdBy": "usr_..." },
    "isNew": true
  }
  ```

#### `GET /api/rooms/:roomId/messages`
Retrieves chat history using keyset cursor-based pagination.
- **Query Parameters:**
  - `limit`: number (default: 50, max: 100)
  - `before`: message ID cursor (optional)
- **Response `200 OK`:**
  ```json
  {
    "messages": [
      {
        "id": "m1728144000abc",
        "roomId": "rm_...",
        "userId": "usr_...",
        "username": "jane_doe",
        "text": "Hello world",
        "isEdited": false,
        "isDeleted": false,
        "createdAt": "2026-10-05T14:01:00Z"
      }
    ],
    "nextCursor": "m1728143900xyz"
  }
  ```

#### `GET /api/rooms/:roomId/members`
Lists all members in the room with assigned roles.

---

### Media Endpoints

#### `POST /api/media/upload`
Uploads base64 media, saves to storage, and generates a structured attachment record.
- **Request Body:**
  ```json
  {
    "data": "data:image/png;base64,iVBORw0KGgo...",
    "type": "image/png",
    "messageId": "msg_optional"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "attachment": {
      "id": "att_...",
      "fileName": "att_....png",
      "mimeType": "image/png",
      "fileSize": 104230,
      "storageUrl": "/uploads/att_....png"
    }
  }
  ```

---

### Moderation Endpoints

#### `GET /api/moderation/logs`
Returns audit logs of moderation actions. Requires `mod` or `admin` role.
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`:**
  ```json
  {
    "logs": [
      {
        "id": "mod_...",
        "roomId": "rm_...",
        "actorUsername": "admin_alice",
        "targetUsername": "troll_user",
        "actionType": "timeout",
        "durationSeconds": 60,
        "reason": "Timed out for 60 seconds",
        "createdAt": "2026-10-05T14:15:00Z"
      }
    ]
  }
  ```

---

### System & Health Probes

- `GET /health`: Liveness probe (`200 OK`, process uptime, status).
- `GET /ready`: Readiness probe verifying PostgreSQL pool connectivity.
- `GET /metrics`: Standard Prometheus metrics scrape target.

---

## 2. WebSocket (Socket.IO) Protocol Reference

### Connection & Handshake
- Client connects to `http://localhost:3000`.
- **Auth Handshake Options:**
  - Token-based: `io({ auth: { token: "<jwt_token>" } })`
  - Anonymous Guest: `io({ auth: { username: "GuestHandle" } })`

### Client-to-Server Events

| Event | Payload | Description |
|---|---|---|
| `joinRoom` | `{ username: string, room: string }` | Joins a room, registers role, broadcasts join |
| `chatMessage` | `string` | Emits a chat message (subject to moderation checks) |
| `editMessage` | `{ msgId: string, newText: string }` | Updates message content (author only) |
| `deleteMessage` | `{ msgId: string }` | Soft-deletes message (author, mod, or admin) |
| `mediaMessage` | `{ data: string, type: string }` | Sends media attachment to room |
| `typing` | `void` | Signals user is actively typing |
| `stopTyping` | `void` | Signals user stopped typing |
| `promoteUser` | `{ targetId: string }` | Admin promotes member to moderator |
| `demoteUser` | `{ targetId: string }` | Admin demotes moderator to member |
| `kickUser` | `{ targetId: string }` | Moderator/Admin kicks target from room |
| `timeoutUser` | `{ targetId: string, duration: number }` | Times out target for $X$ seconds (10–600s) |
| `changeRoomName` | `{ newName: string }` | Admin renames the room |
| `startPrivate` | `{ targetId: string }` | Establishes 1-on-1 private messaging channel |
| `privateChatMessage` | `{ room: string, message: string }` | Sends message inside private channel |
| `leavePrivate` | `{ room: string }` | Leaves private channel and notifies peer |

### Server-to-Client Broadcasts

| Event | Payload | Broadcast Target |
|---|---|---|
| `message` | `{ user: string, text: string, id: string, msgId: string }` | Room members |
| `system` | `string` | Individual socket or room |
| `myRole` | `{ role: "admin" \| "mod" \| "member" }` | Emitting socket |
| `roleChanged` | `{ role: "admin" \| "mod" \| "member" }` | Target socket |
| `roomUsers` | `Array<{ id: string, username: string, role: string }>` | Room members |
| `userTyping` | `{ username: string, id: string }` | Other room members |
| `userStopTyping` | `{ id: string }` | Other room members |
| `messageEdited` | `{ msgId: string, newText: string, editedAt: string }` | Room members |
| `messageDeleted` | `{ msgId: string, deletedAt: string }` | Room members |
| `roomRenamed` | `{ newName: string }` | Room members |
| `kicked` | `{ by: string }` | Target socket |
| `muted` | `number` (seconds remaining) | Target socket |
| `otpWarning` | `void` | Emitting socket |
| `privateStarted` | `{ room: string }` | Both private peers |
| `privateMessage` | `{ user: string, text: string }` | Both private peers |
| `partnerLeft` | `{ username: string }` | Private peer |
