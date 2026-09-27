import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    fileType: { type: String, default: 'application/octet-stream' },
    // Name on disk (local storage); lets us delete the physical file
    storageKey: { type: String, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model('File', fileSchema);
