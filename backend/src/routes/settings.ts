import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAiSettings, updateAiSettings } from '../services/settingsService';

const router = Router();

const settingsSchema = z.object({
  system_prompt: z.string().min(1, 'System prompt is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(2),
});

// GET /api/ai-settings
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getAiSettings());
  })
);

// PUT /api/ai-settings
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    res.json(await updateAiSettings(parsed.data));
  })
);

export default router;
