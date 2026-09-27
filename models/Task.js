import mongoose from 'mongoose';

export const TASK_STATUSES = ['To Do', 'In Progress', 'Completed'];
export const TASK_PRIORITIES = ['Low', 'Medium', 'High'];

const taskSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: [true, 'Task title is required'], trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'Medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'To Do' },
    dueDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Set when status moves to Completed; powers the dashboard's completion timeline
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
