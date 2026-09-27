import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import ChatMessage from '../models/ChatMessage.js';
import File from '../models/File.js';
import CanvasDiagram from '../models/CanvasDiagram.js';
import CodeSnippet from '../models/CodeSnippet.js';
import { asyncHandler, httpError, wsRoom, userRoom, PUBLIC_USER_FIELDS } from '../utils/helpers.js';

const populateWorkspace = (query) =>
  query.populate('owner', PUBLIC_USER_FIELDS).populate('members', PUBLIC_USER_FIELDS);

// Shape sent to the client: members carry their workspace role, plus the caller's own role
export const serializeWorkspace = (ws, viewerId) => {
  const obj = ws.toObject();
  return {
    ...obj,
    members: ws.members.map((m) => ({ ...m.toObject(), workspaceRole: ws.roleOf(m._id) })),
    myRole: viewerId ? ws.roleOf(viewerId) : undefined,
  };
};

const fetchSerialized = async (id, viewerId) => serializeWorkspace(await populateWorkspace(Workspace.findById(id)), viewerId);

const broadcastMembers = async (io, id) => {
  const ws = await populateWorkspace(Workspace.findById(id));
  io.to(wsRoom(id)).emit('members_updated', { workspaceId: String(id), workspace: serializeWorkspace(ws) });
};

export const getMyWorkspaces = asyncHandler(async (req, res) => {
  const uid = req.user._id;
  const list = await populateWorkspace(Workspace.find({ $or: [{ owner: uid }, { members: uid }] }).sort({ createdAt: -1 }));
  res.json({ workspaces: list.map((ws) => serializeWorkspace(ws, uid)) });
});

export const createWorkspace = asyncHandler(async (req, res) => {
  const { name, description = '' } = req.body;
  if (!name?.trim()) throw httpError(400, 'Workspace name is required');
  const uid = req.user._id;

  const ws = await Workspace.create({ name, description, owner: uid, members: [uid], admins: [uid] });
  await CodeSnippet.create({
    workspace: ws._id,
    title: 'main.js',
    language: 'javascript',
    code: `// Welcome to ${ws.name}'s shared editor\n// Everyone in this workspace sees edits live.\n\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('team'));\n`,
    updatedBy: uid,
  });

  res.status(201).json({ workspace: await fetchSerialized(ws._id, uid) });
});

export const getWorkspace = asyncHandler(async (req, res) => {
  res.json({ workspace: await fetchSerialized(req.workspace._id, req.user._id) });
});

export const updateWorkspace = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (name !== undefined) req.workspace.name = name;
  if (description !== undefined) req.workspace.description = description;
  await req.workspace.save();
  await broadcastMembers(req.app.get('io'), req.workspace._id);
  res.json({ workspace: await fetchSerialized(req.workspace._id, req.user._id) });
});

export const deleteWorkspace = asyncHandler(async (req, res) => {
  const ws = req.workspace;
  if (String(ws.owner) !== String(req.user._id)) throw httpError(403, 'Only the owner can delete a workspace');
  const id = ws._id;
  await Promise.all([
    Task.deleteMany({ workspace: id }),
    ChatMessage.deleteMany({ workspace: id }),
    File.deleteMany({ workspace: id }),
    CanvasDiagram.deleteMany({ workspace: id }),
    CodeSnippet.deleteMany({ workspace: id }),
  ]);
  await ws.deleteOne();
  req.app.get('io').to(wsRoom(id)).emit('workspace_deleted', { workspaceId: String(id) });
  res.json({ ok: true });
});

export const inviteMember = asyncHandler(async (req, res) => {
  const { email, role = 'Member' } = req.body;
  if (!email) throw httpError(400, 'Email is required');
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw httpError(404, 'No TeamCollab account uses that email. Ask them to sign up first.');

  const ws = req.workspace;
  if (ws.isMember(user._id)) throw httpError(409, `${user.name} is already a member`);
  ws.members.push(user._id);
  if (role === 'Admin') ws.admins.push(user._id);
  await ws.save();

  const io = req.app.get('io');
  await broadcastMembers(io, ws._id);
  io.to(userRoom(user._id)).emit('workspace_invited', { workspace: await fetchSerialized(ws._id, user._id), by: req.user.name });
  res.status(201).json({ workspace: await fetchSerialized(ws._id, req.user._id) });
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const { userId } = req.params;
  const ws = req.workspace;
  if (!['Admin', 'Member'].includes(role)) throw httpError(400, 'Role must be Admin or Member');
  if (!ws.isMember(userId)) throw httpError(404, 'User is not a member');
  if (String(ws.owner) === String(userId)) throw httpError(400, "The owner's role cannot be changed");

  ws.admins = ws.admins.filter((a) => String(a) !== String(userId));
  if (role === 'Admin') ws.admins.push(userId);
  await ws.save();
  await broadcastMembers(req.app.get('io'), ws._id);
  res.json({ workspace: await fetchSerialized(ws._id, req.user._id) });
});

export const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const ws = req.workspace;
  const self = String(userId) === String(req.user._id);
  if (!self && !ws.isAdmin(req.user._id)) throw httpError(403, 'Workspace admin access required');
  if (String(ws.owner) === String(userId)) throw httpError(400, 'The owner cannot be removed');
  if (!ws.isMember(userId)) throw httpError(404, 'User is not a member');

  ws.members = ws.members.filter((m) => String(m) !== String(userId));
  ws.admins = ws.admins.filter((m) => String(m) !== String(userId));
  await ws.save();
  await Task.updateMany({ workspace: ws._id, assignee: userId }, { assignee: null });

  const io = req.app.get('io');
  await broadcastMembers(io, ws._id);
  io.to(userRoom(userId)).emit('workspace_removed', { workspaceId: String(ws._id) });
  res.json({ ok: true });
});
