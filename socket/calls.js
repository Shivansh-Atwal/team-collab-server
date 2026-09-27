// Video calls: one call per workspace. Media flows peer-to-peer (WebRTC mesh);
// the server only tracks participants and relays signalling messages.
import Workspace from '../models/Workspace.js';
import { userRoom } from '../utils/helpers.js';

const calls = new Map(); // workspaceId -> { startedAt, startedBy, participants: Map<socketId, { user, audio, video, screen }> }

const serialize = (workspaceId) => {
  const call = calls.get(String(workspaceId));
  if (!call) return { workspaceId: String(workspaceId), active: false, participants: [] };
  return {
    workspaceId: String(workspaceId),
    active: true,
    startedAt: call.startedAt,
    startedBy: call.startedBy,
    participants: [...call.participants.entries()].map(([socketId, p]) => ({ socketId, ...p })),
  };
};

// Every member gets call updates in their personal room, whichever workspace/page they are viewing
async function notifyMembers(io, workspaceId, event, payload) {
  const ws = await Workspace.findById(workspaceId).select('owner members name').lean();
  if (!ws) return;
  const ids = new Set([String(ws.owner), ...ws.members.map(String)]);
  ids.forEach((id) => io.to(userRoom(id)).emit(event, { ...payload, workspaceName: ws.name }));
}

export const callInfo = serialize;
export const isInCall = (workspaceId, userId) =>
  [...(calls.get(String(workspaceId))?.participants.values() || [])].some((p) => p.user._id === userId);

export default function registerCallHandlers(io, socket) {
  const { user } = socket.data;
  socket.data.call = null; // workspaceId of the call this socket is in

  const broadcastState = (workspaceId) => notifyMembers(io, workspaceId, 'call:state', serialize(workspaceId));

  const leaveCall = async () => {
    const workspaceId = socket.data.call;
    if (!workspaceId) return;
    socket.data.call = null;
    const call = calls.get(workspaceId);
    if (!call) return;
    call.participants.delete(socket.id);
    call.participants.forEach((_, sid) => io.to(sid).emit('call:peer-left', { socketId: socket.id }));
    if (call.participants.size === 0) calls.delete(workspaceId);
    await broadcastState(workspaceId);
  };

  socket.on('call:status', ({ workspaceId } = {}, ack = () => {}) => ack(serialize(workspaceId)));

  // Start (or join) the workspace call. Returns the peers this socket must connect to.
  socket.on('call:join', async ({ workspaceId, audio = true, video = true } = {}, ack = () => {}) => {
    try {
      const ws = await Workspace.findById(workspaceId);
      if (!ws || !ws.isMember(user._id)) return ack({ ok: false, error: 'Not a member of this workspace' });
      const id = String(ws._id);
      if (socket.data.call && socket.data.call !== id) await leaveCall();

      let call = calls.get(id);
      const isNew = !call;
      if (isNew) {
        call = { startedAt: Date.now(), startedBy: user, participants: new Map() };
        calls.set(id, call);
      }
      const peers = [...call.participants.entries()].map(([socketId, p]) => ({ socketId, ...p }));
      call.participants.set(socket.id, { user, audio, video, screen: false });
      socket.data.call = id;

      peers.forEach((p) => io.to(p.socketId).emit('call:peer-joined', { socketId: socket.id, user, audio, video, screen: false }));
      ack({ ok: true, peers, startedAt: call.startedAt });

      await broadcastState(id);
      // Ring everyone else in the team when a call starts
      if (isNew) await notifyMembers(io, id, 'call:incoming', { workspaceId: id, from: user, startedAt: call.startedAt });
    } catch (err) {
      ack({ ok: false, error: err.message });
    }
  });

  // Relay SDP offers/answers and ICE candidates between two participants of the same call
  socket.on('call:signal', ({ to, data } = {}) => {
    const call = calls.get(socket.data.call);
    if (!call || !call.participants.has(to)) return;
    io.to(to).emit('call:signal', { from: socket.id, user, data });
  });

  socket.on('call:media', (state = {}) => {
    const call = calls.get(socket.data.call);
    const me = call?.participants.get(socket.id);
    if (!me) return;
    ['audio', 'video', 'screen'].forEach((k) => {
      if (typeof state[k] === 'boolean') me[k] = state[k];
    });
    call.participants.forEach((_, sid) => sid !== socket.id && io.to(sid).emit('call:media', { socketId: socket.id, audio: me.audio, video: me.video, screen: me.screen }));
  });

  socket.on('call:leave', leaveCall);
  socket.on('disconnect', leaveCall);
}
