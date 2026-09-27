import User from '../models/User.js';
import { asyncHandler, generateToken, httpError } from '../utils/helpers.js';

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw httpError(400, 'Name, email and password are required');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw httpError(409, 'An account with this email already exists');

  const user = await User.create({ name, email, password });
  res.status(201).json({ user, token: generateToken(user._id) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw httpError(400, 'Email and password are required');

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.matchPassword(password))) throw httpError(401, 'Invalid email or password');

  res.json({ user, token: generateToken(user._id) });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { name, avatar } = req.body;
  if (name !== undefined) req.user.name = name;
  if (avatar !== undefined) req.user.avatar = avatar;
  await req.user.save();
  res.json({ user: req.user });
});
