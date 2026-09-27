import mongoose from 'mongoose';

export const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'sql', 'html', 'css', 'json', 'markdown'];

const codeSnippetSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 120 },
    language: { type: String, enum: CODE_LANGUAGES, default: 'javascript' },
    code: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('CodeSnippet', codeSnippetSchema);
