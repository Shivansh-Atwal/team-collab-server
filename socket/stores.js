// In-memory, write-behind caches for the high-frequency collaborative state (canvas + code).
// Socket events mutate the cache immediately and the DB write is debounced.
import CanvasDiagram from '../models/CanvasDiagram.js';
import CodeSnippet from '../models/CodeSnippet.js';

const SAVE_DELAY = 800;

/* ---------------------------------- Canvas --------------------------------- */
const canvases = new Map(); // workspaceId -> { ready: Promise, elements, lastUpdatedBy, timer }

function canvasEntry(workspaceId) {
  const key = String(workspaceId);
  if (!canvases.has(key)) {
    const entry = { elements: [], lastUpdatedBy: null, timer: null };
    entry.ready = CanvasDiagram.findOne({ workspace: key })
      .lean()
      .then((doc) => {
        entry.elements = doc?.elements || [];
        entry.lastUpdatedBy = doc?.lastUpdatedBy || null;
      });
    canvases.set(key, entry);
  }
  return canvases.get(key);
}

function scheduleCanvasSave(workspaceId, entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    CanvasDiagram.findOneAndUpdate(
      { workspace: workspaceId },
      { elements: entry.elements, lastUpdatedBy: entry.lastUpdatedBy },
      { upsert: true }
    ).catch((err) => console.error('Canvas save failed:', err.message));
  }, SAVE_DELAY);
}

export async function getCanvas(workspaceId) {
  const entry = canvasEntry(workspaceId);
  await entry.ready;
  return { elements: entry.elements, lastUpdatedBy: entry.lastUpdatedBy };
}

// op: { type: 'add', element } | { type: 'update', element: {id, ...patch} } |
//     { type: 'delete', ids: [] } | { type: 'replace', elements: [] }
export async function applyCanvasOp(workspaceId, op, userId) {
  const entry = canvasEntry(workspaceId);
  await entry.ready;
  if (!op || typeof op !== 'object') return false;

  switch (op.type) {
    case 'add':
      if (!op.element?.id || entry.elements.some((e) => e.id === op.element.id)) return false;
      entry.elements.push(op.element);
      break;
    case 'update': {
      const idx = entry.elements.findIndex((e) => e.id === op.element?.id);
      if (idx === -1) return false;
      entry.elements[idx] = { ...entry.elements[idx], ...op.element };
      break;
    }
    case 'delete': {
      const ids = new Set(op.ids || []);
      // Removing a shape also removes connectors attached to it
      entry.elements = entry.elements.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to));
      break;
    }
    case 'replace':
      entry.elements = Array.isArray(op.elements) ? op.elements : [];
      break;
    default:
      return false;
  }
  entry.lastUpdatedBy = userId;
  scheduleCanvasSave(workspaceId, entry);
  return true;
}

export function dropCanvas(workspaceId) {
  canvases.delete(String(workspaceId));
}

/* ----------------------------------- Code ---------------------------------- */
const snippets = new Map(); // snippetId -> { ready, workspaceId, code, updatedBy, timer, missing }

function snippetEntry(snippetId) {
  const key = String(snippetId);
  if (!snippets.has(key)) {
    const entry = { code: '', workspaceId: null, updatedBy: null, timer: null, missing: false };
    entry.ready = CodeSnippet.findById(key)
      .lean()
      .then((doc) => {
        if (!doc) entry.missing = true;
        else {
          entry.code = doc.code;
          entry.workspaceId = String(doc.workspace);
        }
      })
      .catch(() => {
        entry.missing = true;
      });
    snippets.set(key, entry);
  }
  return snippets.get(key);
}

export async function setSnippetCode(workspaceId, snippetId, code, userId) {
  const entry = snippetEntry(snippetId);
  await entry.ready;
  if (entry.missing || entry.workspaceId !== String(workspaceId) || typeof code !== 'string') return false;

  entry.code = code;
  entry.updatedBy = userId;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    CodeSnippet.findByIdAndUpdate(snippetId, { code: entry.code, updatedBy: entry.updatedBy }).catch((err) =>
      console.error('Snippet save failed:', err.message)
    );
  }, SAVE_DELAY);
  return true;
}

// Latest (possibly unsaved) code for a snippet, if cached
export function cachedSnippetCode(snippetId) {
  const entry = snippets.get(String(snippetId));
  return entry && !entry.missing && entry.workspaceId ? entry.code : undefined;
}

export function dropSnippet(snippetId) {
  const entry = snippets.get(String(snippetId));
  if (entry) clearTimeout(entry.timer);
  snippets.delete(String(snippetId));
}
