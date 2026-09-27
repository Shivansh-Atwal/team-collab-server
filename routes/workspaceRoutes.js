import { Router } from 'express';
import { protect, loadWorkspace, requireWorkspaceAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import * as ws from '../controllers/workspaceController.js';
import * as tasks from '../controllers/taskController.js';
import * as messages from '../controllers/messageController.js';
import * as files from '../controllers/fileController.js';
import * as canvas from '../controllers/canvasController.js';
import * as snippets from '../controllers/snippetController.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = Router();
router.use(protect);

// Workspaces
router.route('/').get(ws.getMyWorkspaces).post(ws.createWorkspace);
router
  .route('/:workspaceId')
  .get(loadWorkspace, ws.getWorkspace)
  .patch(loadWorkspace, requireWorkspaceAdmin, ws.updateWorkspace)
  .delete(loadWorkspace, ws.deleteWorkspace);

// Members & roles
router.post('/:workspaceId/members', loadWorkspace, requireWorkspaceAdmin, ws.inviteMember);
router.patch('/:workspaceId/members/:userId', loadWorkspace, requireWorkspaceAdmin, ws.updateMemberRole);
router.delete('/:workspaceId/members/:userId', loadWorkspace, ws.removeMember);

// Tasks
router.route('/:workspaceId/tasks').get(loadWorkspace, tasks.listTasks).post(loadWorkspace, tasks.createTask);
router
  .route('/:workspaceId/tasks/:taskId')
  .patch(loadWorkspace, tasks.updateTask)
  .delete(loadWorkspace, tasks.deleteTask);

// Chat
router.route('/:workspaceId/messages').get(loadWorkspace, messages.listMessages).post(loadWorkspace, messages.postMessage);

// Files
router
  .route('/:workspaceId/files')
  .get(loadWorkspace, files.listFiles)
  .post(loadWorkspace, upload.single('file'), files.uploadFile);
router.delete('/:workspaceId/files/:fileId', loadWorkspace, files.deleteFile);

// Canvas
router.route('/:workspaceId/canvas').get(loadWorkspace, canvas.getDiagram).put(loadWorkspace, canvas.saveDiagram);

// Code snippets
router.route('/:workspaceId/snippets').get(loadWorkspace, snippets.listSnippets).post(loadWorkspace, snippets.createSnippet);
router
  .route('/:workspaceId/snippets/:snippetId')
  .patch(loadWorkspace, snippets.updateSnippet)
  .delete(loadWorkspace, snippets.deleteSnippet);

// Compile & run code (server-side toolchains)
router.post('/:workspaceId/run', loadWorkspace, snippets.runSnippet);

// Dashboard
router.get('/:workspaceId/dashboard', loadWorkspace, getDashboard);

export default router;
