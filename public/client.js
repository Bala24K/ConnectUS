const savedToken = localStorage.getItem('connectus_jwt');
const socket = io({
  auth: savedToken ? { token: savedToken } : {}
});

let currentRoom = null;
let currentUser = null;
let myRole = "member";
let soundEnabled = true;
let unreadPrivate = 0;
let privateRoom = null;
let emojiOpen = false;
let typingTimeout = null;
let typingUsers = {};
let atBottom = true;
let newMsgCount = 0;
let timeoutTargetId = null;

const userRoles = {};
const socketNames = {};

const COLORS = [
  ['#6d28d9', '#ede9fe'], ['#0891b2', '#cffafe'], ['#059669', '#d1fae5'],
  ['#d97706', '#fef3c7'], ['#db2777', '#fce7f3'], ['#7c3aed', '#ede9fe'],
  ['#0369a1', '#e0f2fe'], ['#065f46', '#d1fae5'],
];
const userColorMap = {};
function getUserColor(username) {
  if (!userColorMap[username]) {
    userColorMap[username] = COLORS[Object.keys(userColorMap).length % COLORS.length];
  }
  return userColorMap[username];
}

function makeAvatar(username, size = 20, fontSize = 9) {
  const [bg, fg] = getUserColor(username);
  const el = document.createElement('div');
  el.className = 'msg-avatar';
  el.style.cssText = `background:${bg};color:${fg};width:${size}px;height:${size}px;font-size:${fontSize}px;`;
  el.textContent = username.slice(0, 2).toUpperCase();
  return el;
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeBadge(role) {
  const b = document.createElement('span');
  b.className = `role-badge ${role}`;
  b.textContent = role === 'admin' ? '👑 Admin' : role === 'mod' ? '🛡 Mod' : '';
  return b;
}

function playBeep(freq = 660, dur = 80, type = 'sine') {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(); osc.stop(ctx.currentTime + dur / 1000);
  } catch (_) { }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundToggle');
  const icon = document.getElementById('soundIcon');
  btn.classList.toggle('active', soundEnabled);
  icon.innerHTML = soundEnabled
    ? `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`
    : `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
}

function showToast(msg, isPrivate = false) {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast' + (isPrivate ? ' private-toast' : '');
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toast-out 0.3s forwards';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function scrollToBottom() {
  const box = document.getElementById('messages');
  box.scrollTop = box.scrollHeight;
  newMsgCount = 0;
  updateScrollBtn();
}
function updateScrollBtn() {
  const btn = document.getElementById('scrollBtn');
  const count = document.getElementById('scrollBtnCount');
  if (atBottom || newMsgCount === 0) {
    btn.classList.add('hidden'); newMsgCount = 0;
  } else {
    btn.classList.remove('hidden');
    count.textContent = newMsgCount > 9 ? '9+' : (newMsgCount || '');
  }
}

async function join() {
  const username = document.getElementById('username').value.trim();
  const room = document.getElementById('room').value.trim();
  const password = document.getElementById('password')?.value?.trim();

  if (!username || !room) { showToast('⚠ Username and room required.'); return; }
  if (!socket.connected) { showToast('⚠ Server not connected yet.'); return; }

  // Authenticate via REST API if password is provided
  if (password) {
    try {
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.status === 401 || res.status === 404) {
        // Try register if account does not exist yet
        res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('connectus_jwt', data.token);
        socket.auth = { token: data.token };
      }
    } catch (e) {
      console.warn('Auth fallback to guest session:', e);
    }
  }

  socket.emit('joinRoom', { username, room });
  currentUser = username;
  currentRoom = room;

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.remove('hidden');
  document.getElementById('roomTitle').textContent = '# ' + room;
  document.getElementById('roomBadge').textContent = room;
  document.getElementById('myUsernameDisplay').textContent = username;
  getUserColor(username);

  // Load persistent message history via REST API
  try {
    const token = localStorage.getItem('connectus_jwt');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/messages?limit=30`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          if (!document.querySelector(`[data-msg-id="${msg.id}"]`)) {
            appendMessage({
              user: msg.username,
              text: msg.text,
              id: msg.userId,
              msgId: msg.id
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Could not fetch message history:', err);
  }
}

function send() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('chatMessage', message);
  socket.emit('stopTyping');
  input.value = '';
  document.getElementById('charCount').textContent = '';
  closeEmoji();
}

function startEdit(msgId, currentText) {
  const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!wrapper) return;
  wrapper.classList.add('editing');

  const bubble = wrapper.querySelector('.msg-bubble');
  const originalText = currentText;
  bubble.innerHTML = '';

  const area = document.createElement('div');
  area.className = 'msg-edit-area';

  const textarea = document.createElement('textarea');
  textarea.className = 'msg-edit-input';
  textarea.value = originalText;
  textarea.rows = 1;
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });

  const controls = document.createElement('div');
  controls.className = 'msg-edit-controls';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save'; saveBtn.textContent = 'Save';
  saveBtn.onclick = () => {
    const newText = textarea.value.trim();
    if (newText && newText !== originalText) {
      socket.emit('editMessage', { msgId, newText });
    }
    cancelEdit(msgId, originalText);
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel'; cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => cancelEdit(msgId, originalText);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelEdit(msgId, originalText);
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
  });

  controls.append(cancelBtn, saveBtn);
  area.append(textarea, controls);
  bubble.appendChild(area);

  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  textarea.style.height = textarea.scrollHeight + 'px';
}

function cancelEdit(msgId, originalText) {
  const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!wrapper) return;
  wrapper.classList.remove('editing');
  const bubble = wrapper.querySelector('.msg-bubble');
  bubble.textContent = originalText;
}

function confirmDelete(msgId) {
  if (confirm('Delete this message?')) {
    socket.emit('deleteMessage', { msgId });
  }
}

function canDeleteOther(authorSocketId) {
  const targetRole = userRoles[authorSocketId] || 'member';
  if (myRole === 'admin') return true;
  if (myRole === 'mod' && targetRole === 'member') return true;
  return false;
}

function appendMessage({ user, text, id: authorSocketId, msgId }, container = 'messages') {
  const box = document.getElementById(container);
  const isMe = user === currentUser;

  removeTypingFromBox(container);

  const [bg] = getUserColor(user);
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-item ' + (isMe ? 'me' : 'other');
  if (msgId) {
    wrapper.dataset.msgId = msgId;
    wrapper.dataset.authorId = authorSocketId || '';
    wrapper.dataset.msgText = text;
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const avatar = makeAvatar(user, 20, 9);
  const nameEl = document.createElement('span');
  nameEl.className = 'msg-username';
  nameEl.style.color = bg;
  nameEl.textContent = isMe ? 'You' : user;
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = timeStr();
  if (isMe) meta.append(timeEl, nameEl, avatar);
  else meta.append(avatar, nameEl, timeEl);

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  if (container === 'messages' && msgId) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    if (isMe) {
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn edit';
      editBtn.title = 'Edit';
      editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      editBtn.onclick = () => startEdit(msgId, wrapper.dataset.msgText);

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn delete';
      delBtn.title = 'Delete';
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
      delBtn.onclick = () => confirmDelete(msgId);

      actions.append(editBtn, delBtn);
    } else if (authorSocketId && canDeleteOther(authorSocketId)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn delete';
      delBtn.title = 'Delete (mod)';
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
      delBtn.onclick = () => confirmDelete(msgId);
      actions.appendChild(delBtn);
    }

    if (actions.children.length > 0) {
      body.append(actions, bubble);
    } else {
      body.appendChild(bubble);
    }
  } else {
    body.appendChild(bubble);
  }

  wrapper.append(meta, body);
  box.appendChild(wrapper);

  if (!isMe && container === 'messages') {
    if (!atBottom) { newMsgCount++; updateScrollBtn(); playBeep(660, 80); }
    else scrollToBottom();
  } else if (container === 'messages') {
    scrollToBottom();
  }
}

function appendMedia({ user, data, type }, container = 'messages') {
  const box = document.getElementById(container);
  const isMe = user === currentUser;
  const [bg] = getUserColor(user);

  const wrapper = document.createElement('div');
  wrapper.className = 'msg-item ' + (isMe ? 'me' : 'other');

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const avatar = makeAvatar(user, 20, 9);
  const nameEl = document.createElement('span');
  nameEl.className = 'msg-username'; nameEl.style.color = bg;
  nameEl.textContent = isMe ? 'You' : user;
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time'; timeEl.textContent = timeStr();
  if (isMe) meta.append(timeEl, nameEl, avatar);
  else meta.append(avatar, nameEl, timeEl);

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'msg-media';
  if (type.startsWith('image')) {
    const img = document.createElement('img'); img.src = data; img.alt = 'image';
    mediaWrap.appendChild(img);
  } else if (type.startsWith('video')) {
    const vid = document.createElement('video'); vid.src = data; vid.controls = true;
    mediaWrap.appendChild(vid);
  }

  wrapper.append(meta, mediaWrap);
  box.appendChild(wrapper);
  if (!isMe && !atBottom) { newMsgCount++; updateScrollBtn(); }
  else scrollToBottom();
}

function appendSystem(msg, container = 'messages') {
  const box = document.getElementById(container);
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = msg;
  box.appendChild(div);
  if (atBottom || container !== 'messages') scrollToBottom();
}

function renderTyping(container = 'messages') {
  removeTypingFromBox(container);
  const names = Object.values(typingUsers);
  if (!names.length) return;

  const box = document.getElementById(container);
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.dataset.typingBox = container;

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';

  const txt = document.createElement('span');
  txt.className = 'typing-text';
  txt.textContent = names.length === 1 ? `${names[0]} is typing` : `${names.slice(0, 2).join(' & ')} are typing`;

  el.append(dots, txt);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;

  const statusEl = document.getElementById('typingStatus');
  if (statusEl) { statusEl.textContent = txt.textContent; statusEl.style.color = 'var(--primary-glow)'; }
}

function removeTypingFromBox(container) {
  document.querySelectorAll(`[data-typing-box="${container}"]`).forEach(el => el.remove());
}

function updateTypingStatus() {
  const statusEl = document.getElementById('typingStatus');
  if (!statusEl) return;
  if (!Object.keys(typingUsers).length) { statusEl.textContent = 'All quiet'; statusEl.style.color = ''; }
}

function renderUserList(users) {
  const list = document.getElementById('userList');
  const count = document.getElementById('onlineCount');
  list.innerHTML = '';
  count.textContent = users.length;

  users.forEach(user => {
    userRoles[user.id] = user.role;
    socketNames[user.id] = user.username;

    const [bg, fg] = getUserColor(user.username);
    const li = document.createElement('li');

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.style.cssText = `background:${bg};color:${fg};`;
    avatar.textContent = user.username.slice(0, 2).toUpperCase();

    const name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = user.username;

    const badge = makeBadge(user.role);

    li.append(avatar, name, badge);

    const isSelf = user.id === socket.id;

    if (isSelf) {
      li.style.opacity = '0.5';
      li.style.cursor = 'default';
    } else {
      const canAct = canModerate_client(myRole, user.role);
      if (canAct) {
        const modBtn = document.createElement('button');
        modBtn.className = 'mod-trigger';
        modBtn.textContent = '⋮';
        modBtn.title = 'Actions';
        modBtn.onclick = (e) => {
          e.stopPropagation();
          showModMenu(user.id, user.role, user.username, modBtn);
        };
        li.appendChild(modBtn);
      } else {
        const msgIcon = document.createElement('span');
        msgIcon.className = 'msg-icon';
        msgIcon.textContent = '💬';
        msgIcon.style.cssText = 'opacity:0;font-size:10px;transition:opacity 0.2s;';
        li.appendChild(msgIcon);
        li.addEventListener('mouseenter', () => msgIcon.style.opacity = '0.6');
        li.addEventListener('mouseleave', () => msgIcon.style.opacity = '0');
      }
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('mod-trigger')) return;
        startPrivate(user.id, user.username);
      });
    }

    list.appendChild(li);
  });
}

function canModerate_client(actorRole, targetRole) {
  if (actorRole === 'admin') return true;
  if (actorRole === 'mod' && targetRole === 'member') return true;
  return false;
}

function updateMyRoleDisplay(role) {
  myRole = role;
  const badge = document.getElementById('myRoleBadge');
  if (badge) {
    badge.innerHTML = '';
    if (role !== 'member') badge.appendChild(makeBadge(role));
  }
  const renameBtn = document.getElementById('renameBtn');
  if (renameBtn) renameBtn.classList.toggle('hidden', role !== 'admin');
}

let currentModTarget = null;

function showModMenu(targetId, targetRole, targetName, anchorEl) {
  const menu = document.getElementById('modMenu');
  menu.innerHTML = '';
  currentModTarget = targetId;

  closeModMenu();

  const items = [];

  if (myRole === 'admin') {
    if (targetRole === 'member') {
      items.push({ label: '🛡 Promote to Mod', cls: 'promote', action: () => { socket.emit('promoteUser', { targetId }); closeModMenu(); } });
    }
    if (targetRole === 'mod') {
      items.push({ label: '⬇ Demote to Member', cls: 'demote', action: () => { socket.emit('demoteUser', { targetId }); closeModMenu(); } });
    }
    items.push({ divider: true });
  }

  if (canModerate_client(myRole, targetRole)) {
    items.push({ label: '⏱ Timeout', cls: 'timeout', action: () => { closeModMenu(); openTimeoutPopup(targetId, targetName); } });
    items.push({
      label: '🚪 Kick', cls: 'kick', action: () => {
        if (confirm(`Kick ${targetName}?`)) { socket.emit('kickUser', { targetId }); }
        closeModMenu();
      }
    });
  }

  if (!items.length) return;

  items.forEach(item => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'mod-menu-divider';
      menu.appendChild(div);
    } else {
      const btn = document.createElement('button');
      btn.className = `mod-menu-item ${item.cls}`;
      btn.textContent = item.label;
      btn.onclick = item.action;
      menu.appendChild(btn);
    }
  });

  const rect = anchorEl.getBoundingClientRect();
  const menuW = 170;
  let left = rect.right + 6;
  let top = rect.top;
  if (left + menuW > window.innerWidth) left = rect.left - menuW - 6;
  if (top + 120 > window.innerHeight) top = window.innerHeight - 130;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.classList.remove('hidden');

  setTimeout(() => {
    document.addEventListener('click', closeModMenuOutside);
  }, 10);
}

function closeModMenuOutside(e) {
  const menu = document.getElementById('modMenu');
  if (!menu.contains(e.target)) closeModMenu();
}

function closeModMenu() {
  const menu = document.getElementById('modMenu');
  if (menu) menu.classList.add('hidden');
  document.removeEventListener('click', closeModMenuOutside);
}

function openTimeoutPopup(targetId, targetName) {
  timeoutTargetId = targetId;
  const popup = document.getElementById('timeoutPopup');
  popup.querySelector('.timeout-title').textContent = `⏱ Timeout: ${targetName}`;
  document.getElementById('timeoutInput').value = '60';
  popup.classList.remove('hidden');
  setTimeout(() => document.getElementById('timeoutInput').focus(), 50);
}

function closeTimeoutPopup() {
  document.getElementById('timeoutPopup').classList.add('hidden');
  timeoutTargetId = null;
}

function confirmTimeout() {
  const duration = parseInt(document.getElementById('timeoutInput').value);
  if (timeoutTargetId && duration >= 10) {
    socket.emit('timeoutUser', { targetId: timeoutTargetId, duration });
    closeTimeoutPopup();
  }
}
window.closeTimeoutPopup = closeTimeoutPopup;
window.confirmTimeout = confirmTimeout;

function startRename() {
  document.getElementById('renameBtn').classList.add('hidden');
  document.getElementById('roomTitle').classList.add('hidden');
  const form = document.getElementById('renameForm');
  form.classList.remove('hidden');
  const input = document.getElementById('renameInput');
  input.value = document.getElementById('roomBadge').textContent;
  input.focus();
  input.select();
}

function confirmRename() {
  const val = document.getElementById('renameInput').value.trim();
  if (val) socket.emit('changeRoomName', { newName: val });
  cancelRename();
}

function cancelRename() {
  document.getElementById('renameForm').classList.add('hidden');
  document.getElementById('roomTitle').classList.remove('hidden');
  if (myRole === 'admin') document.getElementById('renameBtn').classList.remove('hidden');
}
window.startRename = startRename;
window.confirmRename = confirmRename;
window.cancelRename = cancelRename;

function toggleEmoji() {
  emojiOpen = !emojiOpen;
  document.getElementById('emojiPanel').classList.toggle('hidden', !emojiOpen);
}
function closeEmoji() {
  emojiOpen = false;
  document.getElementById('emojiPanel').classList.add('hidden');
}
window.toggleEmoji = toggleEmoji;

function buildEmojiGrid() {
  const grid = document.querySelector('.emoji-grid');
  const emojis = grid.textContent.trim().split(/\s+/);
  grid.innerHTML = '';
  emojis.forEach(em => {
    const span = document.createElement('span');
    span.textContent = em;
    grid.appendChild(span);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('messageInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => {
    const len = input.value.length;
    document.getElementById('charCount').textContent = len > 400 ? `${len}/500` : '';
    socket.emit('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1500);
  });

  document.getElementById('privateInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendPrivate(); }
  });
  document.getElementById('privateInput').addEventListener('input', () => {
    if (privateRoom) socket.emit('privateTyping', { room: privateRoom });
  });

  document.getElementById('renameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') cancelRename();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('timeoutPopup').classList.contains('hidden')) closeTimeoutPopup();
    }
  });

  const msgs = document.getElementById('messages');
  msgs.addEventListener('scroll', () => {
    atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    if (atBottom) newMsgCount = 0;
    updateScrollBtn();
  });

  document.getElementById('emojiPanel').addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
      input.value += e.target.textContent;
      input.focus();
    }
  });
  buildEmojiGrid();

  document.addEventListener('click', (e) => {
    if (!document.getElementById('emojiPanel').contains(e.target) &&
      !document.getElementById('emojiToggle').contains(e.target)) {
      closeEmoji();
    }
  });

  document.getElementById('fileInput').addEventListener('change', function () {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => socket.emit('mediaMessage', { data: reader.result, type: file.type });
    reader.readAsDataURL(file); this.value = '';
  });
  document.getElementById('privateFile').addEventListener('change', function () {
    const file = this.files[0]; if (!file || !privateRoom) return;
    const reader = new FileReader();
    reader.onload = () => socket.emit('privateMediaMessage', { room: privateRoom, data: reader.result, type: file.type });
    reader.readAsDataURL(file); this.value = '';
  });
});

socket.on('connect', () => console.log('Connected:', socket.id));

socket.on('message', (data) => appendMessage(data));
socket.on('system', (msg) => appendSystem(msg));
socket.on('mediaMessage', (data) => appendMedia(data));

socket.on('myRole', ({ role }) => updateMyRoleDisplay(role));

socket.on('roleChanged', ({ role }) => {
  updateMyRoleDisplay(role);
  playBeep(role === 'mod' ? 880 : 440, 100);
});

socket.on('roomUsers', (users) => renderUserList(users));

socket.on('userTyping', ({ username, id }) => {
  if (username === currentUser) return;
  typingUsers[id] = username;
  renderTyping();
});
socket.on('userStopTyping', ({ id }) => {
  delete typingUsers[id];
  removeTypingFromBox('messages');
  if (Object.keys(typingUsers).length) renderTyping();
  updateTypingStatus();
});

socket.on('messageEdited', ({ msgId, newText, editedAt }) => {
  const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!wrapper) return;

  wrapper.classList.remove('editing');

  const bubble = wrapper.querySelector('.msg-bubble');
  bubble.textContent = newText;
  wrapper.dataset.msgText = newText;

  let label = wrapper.querySelector('.msg-edited-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'msg-edited-label';
    const body = wrapper.querySelector('.msg-body');
    if (body) body.insertAdjacentElement('afterend', label);
    else wrapper.appendChild(label);
  }
  label.textContent = `edited · ${editedAt}`;
});

socket.on('messageDeleted', ({ msgId, deletedAt }) => {
  const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!wrapper) return;

  wrapper.classList.remove('editing');
  const bubble = wrapper.querySelector('.msg-bubble');
  bubble.classList.add('deleted');
  bubble.textContent = `message deleted · ${deletedAt}`;

  const actions = wrapper.querySelector('.msg-actions');
  if (actions) actions.remove();

  const label = wrapper.querySelector('.msg-edited-label');
  if (label) label.remove();
});

socket.on('roomRenamed', ({ newName }) => {
  document.getElementById('roomTitle').textContent = '# ' + newName;
  document.getElementById('roomBadge').textContent = newName;
});

socket.on('kicked', ({ by }) => {
  showToast(`🚪 You have been kicked by ${by}.`);
  setTimeout(() => {
    document.getElementById('chatScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
  }, 1500);
});

socket.on('otpWarning', () => showToast('⚠️ Do not share OTP or sensitive numbers!'));

socket.on('muted', (seconds) => {
  const input = document.getElementById('messageInput');
  input.disabled = true;
  let remaining = seconds;
  const iv = setInterval(() => {
    input.placeholder = `Muted — ${remaining}s remaining`;
    remaining--;
    if (remaining <= 0) {
      clearInterval(iv);
      input.disabled = false;
      input.placeholder = 'Message the room...';
    }
  }, 1000);
});

socket.on('userDisconnected', (id) => {
  delete typingUsers[id];
  delete userRoles[id];
  delete socketNames[id];
  removeTypingFromBox('messages');
  updateTypingStatus();
});

function startPrivate(targetId, username = 'User') {
  socket.emit('startPrivate', { targetId });
  document.getElementById('privateTitle').textContent = `Private: ${username}`;
}
window.startPrivate = startPrivate;

socket.on('privateStarted', ({ room }) => {
  privateRoom = room;
  document.getElementById('privateBox').classList.remove('hidden');
  const msgs = document.getElementById('privateMessages');
  if (msgs.dataset.room !== room) { msgs.innerHTML = ''; msgs.dataset.room = room; }
  playBeep(880, 60);
});

function closePrivate() {
  if (privateRoom) socket.emit('leavePrivate', { room: privateRoom });
  document.getElementById('privateBox').classList.add('hidden');
  privateRoom = null;
}
window.closePrivate = closePrivate;

function sendPrivate() {
  const input = document.getElementById('privateInput');
  const message = input.value.trim();
  if (!message || !privateRoom) return;
  socket.emit('privateChatMessage', { room: privateRoom, message });
  socket.emit('privateStopTyping', { room: privateRoom });
  input.value = '';
}
window.sendPrivate = sendPrivate;

socket.on('privateMessage', (data) => {
  appendMessage(data, 'privateMessages');
  if (document.getElementById('privateBox').classList.contains('hidden')) {
    showToast(`🔒 ${data.user}: ${data.text.slice(0, 50)}`, true);
  } else {
    playBeep(880, 60);
  }
});

socket.on('privateMediaMessage', (data) => appendMedia(data, 'privateMessages'));

socket.on('privateUserTyping', ({ username }) => {
  const el = document.getElementById('privateTypingStatus');
  if (el) el.textContent = `${username} is typing...`;
});
socket.on('privateUserStopTyping', () => {
  const el = document.getElementById('privateTypingStatus');
  if (el) el.textContent = '';
});

socket.on('partnerLeft', ({ username }) => {
  appendSystem(`${username} has left the conversation.`, 'privateMessages');
  const input = document.getElementById('privateInput');
  input.disabled = true;
  input.placeholder = 'This conversation has ended.';
  const sendBtn = document.querySelector('.private-input-area .send-btn');
  const attBtn = document.querySelector('.private-input-area .attach-btn');
  if (sendBtn) sendBtn.disabled = true;
  if (attBtn) attBtn.disabled = true;
  document.getElementById('privateTypingStatus').textContent = '';
  showToast(`🔒 ${username} has left the private chat.`, true);
});

window.scrollToBottom = scrollToBottom;
window.toggleSound = toggleSound;
window.send = send;