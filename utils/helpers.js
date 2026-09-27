import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-teamcollab-secret';

// Wrap async route handlers so rejected promises reach the error middleware (Express 4)
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const generateToken = (userId) =>
  jwt.sign({ id: String(userId) }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const wsRoom = (workspaceId) => `ws:${workspaceId}`;
export const userRoom = (userId) => `user:${userId}`;

// Stable per-user color used for cursors and avatars (Google palette)
const COLORS = ['#1a73e8', '#d93025', '#e37400', '#188038', '#9334e6', '#007b83', '#c5221f', '#b06000'];
export const userColor = (userId) => {
  const s = String(userId);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
};

export const PUBLIC_USER_FIELDS = 'name email avatar role';
