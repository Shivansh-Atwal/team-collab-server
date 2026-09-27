import { getCanvas, applyCanvasOp } from '../socket/stores.js';
import { asyncHandler, httpError, wsRoom } from '../utils/helpers.js';

export const getDiagram = asyncHandler(async (req, res) => {
  const { elements, lastUpdatedBy } = await getCanvas(req.workspace._id);
  res.json({ elements, lastUpdatedBy });
});

// Replace the whole diagram (used by "Clear" and imports)
export const saveDiagram = asyncHandler(async (req, res) => {
  const { elements } = req.body;
  if (!Array.isArray(elements)) throw httpError(400, 'elements must be an array');
  const op = { type: 'replace', elements };
  await applyCanvasOp(req.workspace._id, op, String(req.user._id));
  req.app.get('io').to(wsRoom(req.workspace._id)).emit('canvas_draw', { workspaceId: String(req.workspace._id), op });
  res.json({ elements });
});
