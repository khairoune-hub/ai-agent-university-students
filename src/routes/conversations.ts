import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listConversations, getConversation } from '../services/messagesService';

const router = Router();

// GET /api/conversations — users who have chatted, with counts + last activity
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listConversations());
  })
);

// GET /api/conversations/:telegramId — full conversation thread
router.get(
  '/:telegramId',
  asyncHandler(async (req, res) => {
    res.json(await getConversation(req.params.telegramId));
  })
);

export default router;
