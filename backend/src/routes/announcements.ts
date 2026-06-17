import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  markSent,
} from '../services/announcementsService';
import { getAllTelegramIds } from '../services/usersService';
import { broadcast, getBot } from '../bot/bot';

const router = Router();

const announcementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
});

// GET /api/announcements
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listAnnouncements());
  })
);

// POST /api/announcements — create (does not send)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    res.status(201).json(await createAnnouncement(parsed.data));
  })
);

// POST /api/announcements/:id/send — broadcast to all users
router.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    if (!getBot()) {
      res.status(503).json({ error: 'البوت غير مفعّل، لا يمكن الإرسال.' });
      return;
    }
    const announcement = await getAnnouncement(Number(req.params.id));
    if (!announcement) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }

    const ids = await getAllTelegramIds();
    const text = `📢 ${announcement.title}\n\n${announcement.message}`;
    const delivered = await broadcast(ids, text);
    const updated = await markSent(announcement.id, delivered);

    res.json({ delivered, total: ids.length, announcement: updated });
  })
);

// DELETE /api/announcements/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await deleteAnnouncement(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Announcement not found' });
      return;
    }
    res.status(204).send();
  })
);

export default router;
