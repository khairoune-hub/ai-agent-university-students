import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { listUsers, countUsers } from '../services/usersService';

const router = Router();

// GET /api/users?limit=&offset=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Number(req.query.offset) || 0;
    const [users, total] = await Promise.all([listUsers(limit, offset), countUsers()]);
    res.json({ users, total });
  })
);

export default router;
