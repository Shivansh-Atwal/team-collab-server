// Who is online in each workspace and which page they are on.
// Tracked per socket so several tabs per user work; the most recently active tab wins.
const rooms = new Map(); // workspaceId -> Map<userId, { user, sockets: Map<socketId, { page, at }> }>

export function addPresence(workspaceId, user, socketId, page = 'overview') {
  const key = String(workspaceId);
  if (!rooms.has(key)) rooms.set(key, new Map());
  const room = rooms.get(key);
  if (!room.has(user._id)) room.set(user._id, { user, sockets: new Map() });
  room.get(user._id).sockets.set(socketId, { page, at: Date.now() });
}

export function setPage(workspaceId, userId, socketId, page) {
  const entry = rooms.get(String(workspaceId))?.get(userId);
  if (!entry?.sockets.has(socketId)) return false;
  entry.sockets.set(socketId, { page, at: Date.now() });
  return true;
}

export function removePresence(workspaceId, userId, socketId) {
  const room = rooms.get(String(workspaceId));
  const entry = room?.get(userId);
  if (!entry) return;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) room.delete(userId);
  if (room.size === 0) rooms.delete(String(workspaceId));
}

// [{ ...user, page }] — page comes from the user's most recently active tab
export function onlineUsers(workspaceId) {
  const room = rooms.get(String(workspaceId));
  if (!room) return [];
  return [...room.values()].map(({ user, sockets }) => {
    const latest = [...sockets.values()].sort((a, b) => b.at - a.at)[0];
    return { ...user, page: latest?.page || 'overview' };
  });
}
