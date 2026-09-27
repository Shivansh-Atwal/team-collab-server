import Task, { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import ChatMessage from '../models/ChatMessage.js';
import File from '../models/File.js';
import CodeSnippet from '../models/CodeSnippet.js';
import Workspace from '../models/Workspace.js';
import { onlineUsers } from '../socket/presence.js';
import { asyncHandler } from '../utils/helpers.js';

const DAYS = 14;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export const getDashboard = asyncHandler(async (req, res) => {
  const wsId = req.workspace._id;
  const [tasks, messageCount, fileCount, snippetCount, ws] = await Promise.all([
    Task.find({ workspace: wsId }).lean(),
    ChatMessage.countDocuments({ workspace: wsId }),
    File.countDocuments({ workspace: wsId }),
    CodeSnippet.countDocuments({ workspace: wsId }),
    Workspace.findById(wsId).populate('members', 'name email avatar'),
  ]);

  const now = new Date();
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
  const byPriority = Object.fromEntries(TASK_PRIORITIES.map((p) => [p, 0]));
  let overdue = 0;
  tasks.forEach((t) => {
    byStatus[t.status] += 1;
    byPriority[t.priority] += 1;
    if (t.dueDate && t.status !== 'Completed' && new Date(t.dueDate) < now) overdue += 1;
  });

  const perMember = ws.members.map((m) => {
    const mine = tasks.filter((t) => String(t.assignee) === String(m._id));
    const completed = mine.filter((t) => t.status === 'Completed').length;
    return {
      user: { _id: m._id, name: m.name, email: m.email, avatar: m.avatar },
      assigned: mine.length,
      completed,
      inProgress: mine.filter((t) => t.status === 'In Progress').length,
      completionRate: mine.length ? Math.round((completed / mine.length) * 100) : 0,
    };
  });

  // Created vs completed per day over the last DAYS days
  const timeline = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    timeline.push({ date: dayKey(d), created: 0, completed: 0 });
  }
  const index = Object.fromEntries(timeline.map((t, i) => [t.date, i]));
  tasks.forEach((t) => {
    const c = index[dayKey(t.createdAt)];
    if (c !== undefined) timeline[c].created += 1;
    if (t.completedAt) {
      const k = index[dayKey(t.completedAt)];
      if (k !== undefined) timeline[k].completed += 1;
    }
  });

  const total = tasks.length;
  res.json({
    totals: {
      tasks: total,
      completed: byStatus.Completed,
      completionRate: total ? Math.round((byStatus.Completed / total) * 100) : 0,
      overdue,
      members: ws.members.length,
      online: onlineUsers(wsId).length,
      messages: messageCount,
      files: fileCount,
      snippets: snippetCount,
    },
    byStatus,
    byPriority,
    perMember,
    timeline,
    onlineUserIds: onlineUsers(wsId).map((u) => u._id),
  });
});
