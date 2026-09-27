import mongoose from 'mongoose';

// elements: [{ id, type: 'rect'|'circle'|'text'|'connector', x, y, width, height, radius,
//              fill, stroke, text, fontSize, from, to }]
const canvasDiagramSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
    elements: { type: Array, default: [] },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model('CanvasDiagram', canvasDiagramSchema);
