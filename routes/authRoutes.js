import { Router } from 'express';
import { signup, login, getMe, updateMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.route('/me').get(protect, getMe).patch(protect, updateMe);

export default router;
