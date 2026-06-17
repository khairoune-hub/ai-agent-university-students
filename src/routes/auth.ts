import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { signAdminToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/login — single-admin login using env credentials.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }
    const { username, password } = parsed.data;
    if (username !== env.adminUsername || password !== env.adminPassword) {
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      return;
    }
    const token = signAdminToken(username);
    res.json({ token, username });
  })
);

export default router;
