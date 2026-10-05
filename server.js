require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const io = new Server(server, { maxHttpBufferSize: 50 * 1024 * 1024 });

app.use(express.static("public"));

const rooms = {};
const roomRoles = {};
const roomMessages = {};
const roomNames = {};
const userStrikes = {};
const mutedUsers = {};
const blockedTopics = {};

function ts() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function getRole(room, socketId) {
  return roomRoles[room]?.[socketId] || "member";
}
function canModerate(actorRole, targetRole) {
  if (actorRole === "admin") return true;
  if (actorRole === "mod" && targetRole === "member") return true;
  return false;
}
function broadcastRoomUsers(room) {
  if (!rooms[room]) return;
  const users = rooms[room].map(u => ({ ...u, role: getRole(room, u.id) }));
  io.to(room).emit("roomUsers", users);
}
function genMsgId() {
  return `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function detectTroll(msg) {
  return ["idiot", "stupid", "hate", "trash"].some(w => msg.toLowerCase().includes(w));
}
function detectOTP(msg) { return /\b\d{4,8}\b/.test(msg); }
function extractTopic(msg) {
  return msg.toLowerCase().split(" ").find(w => w.length > 4) || null;
}

async function generateSoothingReply(message) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                `You are a professional AI moderator for an online chat platform.
             A user sent this offensive message: "${message}"
             Write a calm but firm response. Explain why this language is harmful.
             Encourage respectful discussion. Minimum 5 sentences.` }]
          }]
        })
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI moderation unavailable.";
  } catch { return "AI moderation service unavailable."; }
}


io.on("connection", (socket) => {

  socket.on("joinRoom", ({ username, room }) => {
    if (!username || !room) return;
    socket.username = username;
    socket.room = room;
    socket.join(room);

    if (!rooms[room]) rooms[room] = [];
    if (!roomRoles[room]) roomRoles[room] = {};
    if (!roomMessages[room]) roomMessages[room] = {};

    const isFirst = rooms[room].length === 0;
    rooms[room].push({ id: socket.id, username });
    roomRoles[room][socket.id] = isFirst ? "admin" : "member";

    socket.emit("myRole", { role: roomRoles[room][socket.id] });
    if (roomNames[room]) socket.emit("roomRenamed", { newName: roomNames[room] });

    io.to(room).emit("system", `${username} joined the room`);
    broadcastRoomUsers(room);
  });

  socket.on("typing", () => {
    if (!socket.room) return;
    socket.to(socket.room).emit("userTyping", { username: socket.username, id: socket.id });
  });
  socket.on("stopTyping", () => {
    if (!socket.room) return;
    socket.to(socket.room).emit("userStopTyping", { id: socket.id });
  });
  socket.on("privateTyping", ({ room }) => socket.to(room).emit("privateUserTyping", { username: socket.username }));
  socket.on("privateStopTyping", ({ room }) => socket.to(room).emit("privateUserStopTyping"));

  socket.on("mediaMessage", ({ data, type }) => {
    if (!socket.room) return;
    io.to(socket.room).emit("mediaMessage", { user: socket.username, data, type });
  });
  socket.on("privateMediaMessage", ({ room, data, type }) => {
    if (!socket.room) return;
    io.to(room).emit("privateMediaMessage", { user: socket.username, data, type });
  });

  socket.on("chatMessage", async (message) => {
    if (mutedUsers[socket.id]) {
      if (Date.now() < mutedUsers[socket.id]) {
        socket.emit("muted", Math.ceil((mutedUsers[socket.id] - Date.now()) / 1000));
        return;
      }
      delete mutedUsers[socket.id];
      userStrikes[socket.id] = 0;
      socket.emit("system", "You are now unmuted.");
    }

    const room = socket.room;
    if (!room) return;

    if (detectOTP(message)) { socket.emit("otpWarning"); return; }

    if (detectTroll(message)) {
      if (!userStrikes[socket.id]) userStrikes[socket.id] = 0;
      userStrikes[socket.id]++;
      const reply = await generateSoothingReply(message);
      socket.emit("system", "🤖 AI Moderator:\n" + reply);
      if (userStrikes[socket.id] === 2) {
        mutedUsers[socket.id] = Date.now() + 60000;
        socket.emit("system", "⚠ You are muted for 60 seconds.");
        return;
      }
      if (userStrikes[socket.id] >= 4) {
        socket.emit("system", "🚫 You have been removed for repeated abuse.");
        socket.disconnect(true);
        return;
      }
      return;
    }

    const topic = extractTopic(message);
    if (topic && blockedTopics[room]?.[topic] && Date.now() < blockedTopics[room][topic]) {
      socket.emit("system", "Let's avoid that topic for now 🙂");
      return;
    }

    const msgId = genMsgId();
    roomMessages[room][msgId] = {
      text: message, user: socket.username,
      socketId: socket.id, deleted: false, edited: false
    };
    io.to(room).emit("message", { user: socket.username, text: message, id: socket.id, msgId });
  });

  socket.on("editMessage", ({ msgId, newText }) => {
    const room = socket.room;
    if (!room) return;
    const msg = roomMessages[room]?.[msgId];
    if (!msg || msg.deleted || msg.socketId !== socket.id) return;
    const clean = newText?.trim();
    if (!clean || clean === msg.text) return;

    msg.text = clean;
    msg.edited = true;
    msg.editedAt = ts();
    io.to(room).emit("messageEdited", { msgId, newText: clean, editedAt: msg.editedAt });
  });

  socket.on("deleteMessage", ({ msgId }) => {
    const room = socket.room;
    if (!room) return;
    const msg = roomMessages[room]?.[msgId];
    if (!msg || msg.deleted) return;

    const actorRole = getRole(room, socket.id);
    const isOwn = msg.socketId === socket.id;
    const targetRole = getRole(room, msg.socketId);

    if (!isOwn && !canModerate(actorRole, targetRole)) return;

    msg.deleted = true;
    io.to(room).emit("messageDeleted", { msgId, deletedAt: ts() });
  });

  socket.on("promoteUser", ({ targetId }) => {
    const room = socket.room;
    if (!room || getRole(room, socket.id) !== "admin") return;
    if (getRole(room, targetId) !== "member") return;

    roomRoles[room][targetId] = "mod";
    const name = rooms[room].find(u => u.id === targetId)?.username || "User";
    io.to(targetId).emit("roleChanged", { role: "mod" });
    io.to(targetId).emit("system", "🛡️ You have been promoted to Moderator.");
    io.to(room).emit("system", `🛡️ ${name} has been promoted to Moderator.`);
    broadcastRoomUsers(room);
  });

  socket.on("demoteUser", ({ targetId }) => {
    const room = socket.room;
    if (!room || getRole(room, socket.id) !== "admin") return;
    if (getRole(room, targetId) !== "mod") return;

    roomRoles[room][targetId] = "member";
    const name = rooms[room].find(u => u.id === targetId)?.username || "User";
    io.to(targetId).emit("roleChanged", { role: "member" });
    io.to(targetId).emit("system", "You have been demoted to Member.");
    io.to(room).emit("system", `${name} has been demoted to Member.`);
    broadcastRoomUsers(room);
  });

  socket.on("kickUser", ({ targetId }) => {
    const room = socket.room;
    if (!room) return;
    if (!canModerate(getRole(room, socket.id), getRole(room, targetId))) return;

    const name = rooms[room].find(u => u.id === targetId)?.username || "User";
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit("kicked", { by: socket.username });
      setTimeout(() => targetSocket.disconnect(true), 600);
    }
    const actLabel = getRole(room, socket.id) === "admin" ? "Admin" : "Mod";
    io.to(room).emit("system", `🚪 ${name} was kicked by ${actLabel}.`);
  });

  socket.on("timeoutUser", ({ targetId, duration }) => {
    const room = socket.room;
    if (!room) return;
    if (!canModerate(getRole(room, socket.id), getRole(room, targetId))) return;

    const secs = Math.min(Math.max(parseInt(duration) || 60, 10), 600);
    mutedUsers[targetId] = Date.now() + secs * 1000;
    const name = rooms[room].find(u => u.id === targetId)?.username || "User";

    io.to(targetId).emit("muted", secs);
    io.to(targetId).emit("system", `⏱ You have been timed out for ${secs}s.`);
    socket.emit("system", `⏱ Timed out ${name} for ${secs}s.`);
  });

  socket.on("changeRoomName", ({ newName }) => {
    const room = socket.room;
    if (!room || getRole(room, socket.id) !== "admin") return;
    const clean = newName?.trim().slice(0, 30);
    if (!clean) return;
    roomNames[room] = clean;
    io.to(room).emit("roomRenamed", { newName: clean });
    io.to(room).emit("system", `📝 Room renamed to "${clean}".`);
  });

  socket.on("startPrivate", ({ targetId }) => {
    const ids = [socket.id, targetId].sort();
    const pvRoom = `private_${ids[0]}_${ids[1]}`;
    socket.join(pvRoom);
    const tSocket = io.sockets.sockets.get(targetId);
    if (tSocket) tSocket.join(pvRoom);
    socket.emit("privateStarted", { room: pvRoom });
    io.to(targetId).emit("privateStarted", { room: pvRoom });
  });
  socket.on("privateChatMessage", ({ room, message }) => {
    io.to(room).emit("privateMessage", { user: socket.username, text: message });
  });
  socket.on("leavePrivate", ({ room }) => {
    socket.to(room).emit("partnerLeft", { username: socket.username });
    socket.leave(room);
  });
  socket.on("chatMessageConfirmed", (message) => {
    const msgId = genMsgId();
    if (socket.room && roomMessages[socket.room]) {
      roomMessages[socket.room][msgId] = {
        text: message, user: socket.username,
        socketId: socket.id, deleted: false, edited: false
      };
    }
    io.to(socket.room).emit("message", { user: socket.username, text: message, id: socket.id, msgId });
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (!room) return;

    for (const r of socket.rooms) {
      if (r.startsWith("private_")) {
        socket.to(r).emit("partnerLeft", { username: socket.username });
      }
    }

    rooms[room] = rooms[room]?.filter(u => u.id !== socket.id) || [];
    if (roomRoles[room]) delete roomRoles[room][socket.id];

    io.to(room).emit("system", `${socket.username} left the room`);
    broadcastRoomUsers(room);
    io.emit("userDisconnected", socket.id);
  });

});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));