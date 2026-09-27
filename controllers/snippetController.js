import CodeSnippet, { CODE_LANGUAGES } from '../models/CodeSnippet.js';
import { cachedSnippetCode, dropSnippet, setSnippetCode } from '../socket/stores.js';
import { asyncHandler, httpError, wsRoom } from '../utils/helpers.js';
import { runCode } from '../services/codeRunner.js';

const withLiveCode = (snippet) => {
  const obj = snippet.toObject();
  const live = cachedSnippetCode(snippet._id);
  return live === undefined ? obj : { ...obj, code: live };
};

const emit = (req, event, payload) =>
  req.app.get('io').to(wsRoom(req.workspace._id)).emit(event, { workspaceId: String(req.workspace._id), ...payload });

export const listSnippets = asyncHandler(async (req, res) => {
  const snippets = await CodeSnippet.find({ workspace: req.workspace._id }).sort({ createdAt: 1 }).populate('updatedBy', 'name');
  res.json({ snippets: snippets.map(withLiveCode) });
});

export const createSnippet = asyncHandler(async (req, res) => {
  const { title, language = 'javascript', code = '' } = req.body;
  if (!title?.trim()) throw httpError(400, 'Title is required');
  if (!CODE_LANGUAGES.includes(language)) throw httpError(400, 'Unsupported language');
  const snippet = await CodeSnippet.create({ workspace: req.workspace._id, title, language, code, updatedBy: req.user._id });
  emit(req, 'snippet_created', { snippet });
  res.status(201).json({ snippet });
});

export const updateSnippet = asyncHandler(async (req, res) => {
  const snippet = await CodeSnippet.findOne({ _id: req.params.snippetId, workspace: req.workspace._id });
  if (!snippet) throw httpError(404, 'Snippet not found');
  const { title, language, code } = req.body;
  if (title !== undefined) snippet.title = title;
  if (language !== undefined) {
    if (!CODE_LANGUAGES.includes(language)) throw httpError(400, 'Unsupported language');
    snippet.language = language;
  }
  if (code !== undefined) {
    snippet.code = code;
    await setSnippetCode(req.workspace._id, snippet._id, code, String(req.user._id));
  }
  snippet.updatedBy = req.user._id;
  await snippet.save();
  const out = withLiveCode(snippet);
  emit(req, 'snippet_updated', { snippet: out });
  res.json({ snippet: out });
});

export const deleteSnippet = asyncHandler(async (req, res) => {
  const snippet = await CodeSnippet.findOneAndDelete({ _id: req.params.snippetId, workspace: req.workspace._id });
  if (!snippet) throw httpError(404, 'Snippet not found');
  dropSnippet(snippet._id);
  emit(req, 'snippet_deleted', { snippetId: String(snippet._id) });
  res.json({ ok: true });
});

export const runSnippet = asyncHandler(async (req, res) => {
  if (process.env.CODE_RUNNER === 'off') throw httpError(403, 'Code execution is disabled on this server');
  const { language, code, stdin = '' } = req.body;
  if (typeof code !== 'string' || code.length > 100_000) throw httpError(400, 'Code must be a string under 100 KB');
  const result = await runCode({ language, code, stdin: String(stdin).slice(0, 100_000) });
  if (result.busy) throw httpError(429, 'The runner is busy, try again in a moment');
  res.json(result);
});
