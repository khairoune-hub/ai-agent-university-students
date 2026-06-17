import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  listArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
} from '../services/articlesService';

const router = Router();

const articleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.string().min(1, 'Category is required'),
  content: z.string().min(1, 'Content is required'),
});

// GET /api/articles?category=...
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    res.json(await listArticles(category));
  })
);

// GET /api/articles/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const article = await getArticle(Number(req.params.id));
    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.json(article);
  })
);

// POST /api/articles
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    res.status(201).json(await createArticle(parsed.data));
  })
);

// PUT /api/articles/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const updated = await updateArticle(Number(req.params.id), parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.json(updated);
  })
);

// DELETE /api/articles/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteArticle(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
