import fs from 'fs/promises';
import path from 'path';
import File from '../models/File.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import { asyncHandler, httpError, wsRoom } from '../utils/helpers.js';

const USER_FIELDS = 'name email avatar';

export const listFiles = asyncHandler(async (req, res) => {
  const files = await File.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }).populate('uploadedBy', USER_FIELDS);
  res.json({ files });
});

export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No file uploaded (field name must be "file")');
  const created = await File.create({
    workspace: req.workspace._id,
    uploadedBy: req.user._id,
    fileName: req.file.originalname,
    fileUrl: `/uploads/${req.file.filename}`,
    fileSize: req.file.size,
    fileType: req.file.mimetype,
    storageKey: req.file.filename,
  });
  const file = await File.findById(created._id).populate('uploadedBy', USER_FIELDS);
  req.app.get('io').to(wsRoom(req.workspace._id)).emit('file_uploaded', { workspaceId: String(req.workspace._id), file });
  res.status(201).json({ file });
});

export const deleteFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({ _id: req.params.fileId, workspace: req.workspace._id }).select('+storageKey');
  if (!file) throw httpError(404, 'File not found');
  if (String(file.uploadedBy) !== String(req.user._id) && !req.workspace.isAdmin(req.user._id)) {
    throw httpError(403, 'Only the uploader or a workspace admin can delete this file');
  }
  if (file.storageKey) await fs.unlink(path.join(UPLOAD_DIR, file.storageKey)).catch(() => {});
  await file.deleteOne();
  req.app.get('io').to(wsRoom(req.workspace._id)).emit('file_deleted', { workspaceId: String(req.workspace._id), fileId: String(file._id) });
  res.json({ ok: true });
});
