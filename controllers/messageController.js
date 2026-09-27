import ChatMessage from '../models/ChatMessage.js';
import { asyncHandler, httpError, wsRoom } from '../utils/helpers.js';

const SENDER_FIELDS = 'name email avatar';

// Shared by the REST endpoint and the `send_message` socket event
export async function createMessage({ workspaceId, senderId, text = '', attachments = [] }) {
  const cleanText = String(text).trim();
  const cleanAttachments = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => typeof a === 'string' && a.startsWith('/uploads/'))
    .slice(0, 10);
  if (!cleanText && cleanAttachments.length === 0) throw httpError(400, 'Message is empty');

  const msg = await ChatMessage.create({ workspace: workspaceId, sender: senderId, text: cleanText, attachments: cleanAttachments });
  return msg.populate('sender', SENDER_FIELDS);
}

export const listMessages = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const filter = { workspace: req.workspace._id };
  if (req.query.before) filter.timestamp = { $lt: new Date(req.query.before) };

  const messages = await ChatMessage.find(filter).sort({ timestamp: -1 }).limit(limit).populate('sender', SENDER_FIELDS);
  res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
});

export const postMessage = asyncHandler(async (req, res) => {
  const message = await createMessage({ workspaceId: req.workspace._id, senderId: req.user._id, ...req.body });
  req.app.get('io').to(wsRoom(req.workspace._id)).emit('receive_message', message);
  res.status(201).json({ message });
});
