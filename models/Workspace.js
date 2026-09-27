import mongoose from 'mongoose';

const idOf = (v) => String(v?._id ?? v);

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Workspace name is required'], trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Workspace-scoped roles: anyone listed here (plus the owner) is an Admin, everyone else a Member
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

workspaceSchema.methods.isMember = function isMember(userId) {
  const id = String(userId);
  return idOf(this.owner) === id || this.members.some((m) => idOf(m) === id);
};

workspaceSchema.methods.isAdmin = function isAdmin(userId) {
  const id = String(userId);
  return idOf(this.owner) === id || this.admins.some((m) => idOf(m) === id);
};

workspaceSchema.methods.roleOf = function roleOf(userId) {
  if (idOf(this.owner) === String(userId)) return 'Owner';
  return this.isAdmin(userId) ? 'Admin' : 'Member';
};

export default mongoose.model('Workspace', workspaceSchema);
