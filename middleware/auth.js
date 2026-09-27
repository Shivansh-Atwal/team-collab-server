import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { asyncHandler, httpError, JWT_SECRET } from '../utils/helpers.js';

export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Not authorized, no token');

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw httpError(401, 'Not authorized, token invalid or expired');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw httpError(401, 'Not authorized, user no longer exists');
  req.user = user;
  next();
});

// Loads :workspaceId and ensures the current user belongs to it
export const loadWorkspace = asyncHandler(async (req, res, next) => {
  const workspace = await Workspace.findById(req.params.workspaceId);
  if (!workspace) throw httpError(404, 'Workspace not found');
  if (!workspace.isMember(req.user._id)) throw httpError(403, 'You are not a member of this workspace');
  req.workspace = workspace;
  next();
});

export const requireWorkspaceAdmin = (req, res, next) => {
  if (!req.workspace.isAdmin(req.user._id)) return next(httpError(403, 'Workspace admin access required'));
  next();
};
