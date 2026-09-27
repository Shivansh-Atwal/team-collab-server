import Task, { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import { asyncHandler, httpError, wsRoom } from '../utils/helpers.js';

const USER_FIELDS = 'name email avatar';
const populateTask = (q) => q.populate('assignee', USER_FIELDS).populate('createdBy', USER_FIELDS);

const emitTask = (req, payload) =>
  req.app.get('io').to(wsRoom(req.workspace._id)).emit('task_updated', { workspaceId: String(req.workspace._id), by: String(req.user._id), ...payload });

const checkAssignee = (ws, assignee) => {
  if (assignee && !ws.isMember(assignee)) throw httpError(400, 'Assignee must be a workspace member');
};

export const listTasks = asyncHandler(async (req, res) => {
  const tasks = await populateTask(Task.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }));
  res.json({ tasks });
});

export const createTask = asyncHandler(async (req, res) => {
  const { title, description, assignee, priority, status, dueDate } = req.body;
  if (!title?.trim()) throw httpError(400, 'Task title is required');
  checkAssignee(req.workspace, assignee);

  const created = await Task.create({
    workspace: req.workspace._id,
    title,
    description,
    assignee: assignee || null,
    priority,
    status,
    dueDate: dueDate || null,
    createdBy: req.user._id,
    completedAt: status === 'Completed' ? new Date() : null,
  });
  const task = await populateTask(Task.findById(created._id));
  emitTask(req, { action: 'created', task });
  res.status(201).json({ task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.taskId, workspace: req.workspace._id });
  if (!task) throw httpError(404, 'Task not found');

  const { title, description, assignee, priority, status, dueDate } = req.body;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (assignee !== undefined) {
    checkAssignee(req.workspace, assignee);
    task.assignee = assignee || null;
  }
  if (priority !== undefined) {
    if (!TASK_PRIORITIES.includes(priority)) throw httpError(400, 'Invalid priority');
    task.priority = priority;
  }
  if (status !== undefined) {
    if (!TASK_STATUSES.includes(status)) throw httpError(400, 'Invalid status');
    if (status === 'Completed' && task.status !== 'Completed') task.completedAt = new Date();
    if (status !== 'Completed') task.completedAt = null;
    task.status = status;
  }
  if (dueDate !== undefined) task.dueDate = dueDate || null;
  await task.save();

  const populated = await populateTask(Task.findById(task._id));
  emitTask(req, { action: 'updated', task: populated });
  res.json({ task: populated });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.taskId, workspace: req.workspace._id });
  if (!task) throw httpError(404, 'Task not found');
  emitTask(req, { action: 'deleted', taskId: String(task._id) });
  res.json({ ok: true });
});
