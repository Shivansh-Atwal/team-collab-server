import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { createMessage } from '../controllers/messageController.js';
import { applyCanvasOp, setSnippetCode } from './stores.js';
import { addPresence, removePresence, onlineUsers, setPage } from './presence.js';
import registerCallHandlers from './calls.js';
import { JWT_SECRET, wsRoom, userRoom, userColor } from '../utils/helpers.js';

const noop = () => {};

export default function registerSocketHandlers(io) {
  // Authenticate every socket with the same JWT the REST API uses
  io.use(async (socket, next) => {
    try {
      const { token } = socket.handshake.auth || {};
      const { id } = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(id).lean();
      if (!user) throw new Error('User not found');
      socket.data.user = { _id: String(user._id), name: user.name, email: user.email, avatar: user.avatar, color: userColor(user._id) };
      socket.data.workspaces = new Set();
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(userRoom(user._id));

    const joined = (workspaceId) => workspaceId && socket.data.workspaces.has(String(workspaceId));
    const emitPresence = (workspaceId) =>
      io.to(wsRoom(workspaceId)).emit('presence_update', { workspaceId: String(workspaceId), online: onlineUsers(workspaceId) });

    const leave = (workspaceId) => {
      const id = String(workspaceId);
      if (!socket.data.workspaces.has(id)) return;
      socket.data.workspaces.delete(id);
      socket.leave(wsRoom(id));
      removePresence(id, user._id, socket.id);
      emitPresence(id);
    };

    socket.on('join_workspace', async ({ workspaceId, page } = {}, ack = noop) => {
      try {
        const ws = await Workspace.findById(workspaceId);
        if (!ws || !ws.isMember(user._id)) return ack({ ok: false, error: 'Not a member of this workspace' });
        const id = String(ws._id);
        // A socket views one workspace at a time
        [...socket.data.workspaces].filter((w) => w !== id).forEach(leave);
        if (!socket.data.workspaces.has(id)) {
          socket.data.workspaces.add(id);
          socket.join(wsRoom(id));
          addPresence(id, user, socket.id, page);
          emitPresence(id);
        } else if (page && setPage(id, user._id, socket.id, page)) emitPresence(id);
        ack({ ok: true, online: onlineUsers(id), me: user });
      } catch (err) {
        ack({ ok: false, error: err.message });
      }
    });

    socket.on('leave_workspace', ({ workspaceId } = {}) => leave(workspaceId));

    // Which page (chat, board, canvas, …) this user is looking at
    socket.on('presence_page', ({ workspaceId, page } = {}) => {
      if (!joined(workspaceId) || typeof page !== 'string') return;
      if (setPage(workspaceId, user._id, socket.id, page.slice(0, 30))) emitPresence(workspaceId);
    });

    registerCallHandlers(io, socket);

    /* ---------------------------------- Chat --------------------------------- */
    socket.on('send_message', async ({ workspaceId, text, attachments } = {}, ack = noop) => {
      if (!joined(workspaceId)) return ack({ ok: false, error: 'Join the workspace first' });
      try {
        const message = await createMessage({ workspaceId, senderId: user._id, text, attachments });
        io.to(wsRoom(workspaceId)).emit('receive_message', message);
        ack({ ok: true, message });
      } catch (err) {
        ack({ ok: false, error: err.message });
      }
    });

    socket.on('typing', ({ workspaceId, isTyping } = {}) => {
      if (!joined(workspaceId)) return;
      socket.to(wsRoom(workspaceId)).emit('typing', { workspaceId, user, isTyping: !!isTyping });
    });

    /* --------------------------------- Canvas -------------------------------- */
    socket.on('canvas_draw', async ({ workspaceId, op } = {}) => {
      if (!joined(workspaceId)) return;
      try {
        if (await applyCanvasOp(workspaceId, op, user._id)) {
          socket.to(wsRoom(workspaceId)).emit('canvas_draw', { workspaceId, op, user });
        }
      } catch (err) {
        console.error('canvas_draw failed:', err.message);
      }
    });

    socket.on('canvas_cursor', ({ workspaceId, x, y } = {}) => {
      if (!joined(workspaceId)) return;
      socket.to(wsRoom(workspaceId)).emit('canvas_cursor', { user, x, y });
    });

    /* ---------------------------------- Code --------------------------------- */
    socket.on('code_change', async ({ workspaceId, snippetId, code } = {}) => {
      if (!joined(workspaceId)) return;
      try {
        if (await setSnippetCode(workspaceId, snippetId, code, user._id)) {
          socket.to(wsRoom(workspaceId)).emit('code_change', { snippetId, code, user });
        }
      } catch (err) {
        console.error('code_change failed:', err.message);
      }
    });

    socket.on('code_cursor', ({ workspaceId, snippetId, position, selection } = {}) => {
      if (!joined(workspaceId)) return;
      socket.to(wsRoom(workspaceId)).emit('code_cursor', { snippetId, position, selection, user });
    });

    socket.on('disconnecting', () => {
      [...socket.data.workspaces].forEach(leave);
    });
  });
}
