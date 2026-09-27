import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '', maxlength: 5000 },
  attachments: [{ type: String }],
  timestamp: { type: Date, default: Date.now },
});

chatMessageSchema.index({ workspace: 1, timestamp: -1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
